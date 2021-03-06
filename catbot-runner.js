var fs = require('fs');
var WebClient = require('@slack/client').WebClient;

function CatRunner() {
	console.log("constructing.");

	this.RtmClient = undefined;
	this.RTM_EVENTS = undefined;

	this.token = undefined;

	this.rtm = undefined;

	this.commonStorage = undefined;
	this.userStorage = undefined;
	this.moduleStorage = undefined;

	this.DEFAULT_MODULE_NAME = 'default';

	console.log("constructed.");
}

CatRunner.prototype.init = function(client, events, tok) {
	console.log("initializing.");
	this.RtmClient = client;
	this.RTM_EVENTS = events;
	this.token = tok;
	this.rtm = new this.RtmClient(this.token, { logLevel: 'warning' });
	this.sanitize = require("sanitize-filename");
  this.webClient = new WebClient(tok);
	var config = require('config');
	var mysql = require('mysql');
	var dbConfig = config.get('DB');
	if (dbConfig.useJawsURL){
		this.connection = mysql.createConnection(process.env.JAWSDB_URL);
	}else{
		this.connection = mysql.createConnection(dbConfig);		
	}
	this.connection.connect();

	// Ensure tables exist.
	var sprintf = require('sprintf');
	var create_query = 'CREATE TABLE IF NOT EXISTS %s (id VARCHAR(64) NOT NULL, data_key VARCHAR(64) NOT NULL, data_value VARCHAR(32767) NOT NULL, PRIMARY KEY(id, data_key)) ENGINE=InnoDB;';
	this.connection.query(sprintf(create_query, 'user_data'), function(err, result){
		// TODO: error handling.
	});

	this.connection.query(sprintf(create_query, 'module_data'), function(err, result){
		// TODO: error handling.
	});

	this.connection.query(sprintf(create_query, 'global_data'), function(err, result){
		// TODO: error handling.
	});

	this.storageFactory = require("./storage_factory").StorageFactory;

	this.channelRe = /#.*/;
	this.userRe = /<@[UW][A-Za-z0-9]+>/;

	console.log("initialized.");
	this.regex = /^\?/;
};

CatRunner.prototype.start = function() {
	console.log("starting");
	this.rtm.start();

	var self = this;
	this.rtm.on(this.RTM_EVENTS.MESSAGE, function(m) {
		self.handleRtmMessage(m);
	});
	this.rtm.on(this.RTM_EVENTS.REACTION_ADDED, function handleRtmReactionAdded(reaction) {
	  // TODO
	});

	this.rtm.on(this.RTM_EVENTS.REACTION_REMOVED, function handleRtmReactionRemoved(reaction) {
	  // TODO
	});
	console.log("started");
};

CatRunner.prototype.loader = function(moduleName) {
	// don't throw if moduleName doesn't exist.
	try { return require(moduleName); } catch (e) {console.log(e); };
};

CatRunner.prototype.shouldInvokeOn = function(message) {
	return (message.type == 'message' && message.text && message.text.match && message.text.match(this.regex));
};

CatRunner.prototype.handleRtmMessage = function(message) {
	if (this.shouldInvokeOn(message)) {
		var cleanMessage = message.text.replace(this.regex, '');
		var pieces = cleanMessage.split(' ');
		var bareModule = this.sanitize(pieces[0]);
		var moduleName = './modules/' +  bareModule + '.js';

		console.log("loading " + moduleName);

		var handler = this.loader(moduleName);
		if (!handler) {
			// if we didn't find a handler, try the default handler.
			console.log("loading default handler");
			moduleName = './modules/' + this.DEFAULT_MODULE_NAME + '.js';
			handler = this.loader(moduleName);
		}

		if (!handler){
			console.log('no handler');
			return;
		}

		pieces.shift();

		// protect ourselves from bad code/bugs in the handlers
		// TODO: maybe only do this if "production" flag is on or something like that.
		try {
			var self = this;
			var moduleStorageFactory = new this.storageFactory(this.connection, this.sanitize(moduleName));
			handler.handle(message.user, pieces.slice(0), moduleStorageFactory,
         function(result){
					if (result) {
						  if (result.file) {
                  var streamOpts = {
                      file: fs.createReadStream(result.file),
                      channels: message.channel
                  };

                  self.webClient.files.upload(result.filename, streamOpts, function(err, res) {
                      if (err) {
                          self.rtm.sendMessage("Upload nok", message.channel);
                      };
                  });
						}
						if (result.message) {
							// TODO: allow bots to return attachments; use them here.
							self.rtm.sendMessage(result.message, message.channel);
						}
					}
			  }, bareModule);
		} catch (e) {
			console.log("Error while executing " + moduleName + ": " + e);
		}

		// unload the module so changes will be picked up without restarting the server
		var name = require.resolve(moduleName);
		delete require.cache[name];
	}
};

exports.CatRunner = CatRunner;
