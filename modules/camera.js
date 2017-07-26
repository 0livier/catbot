var download = require('download-file')

var url = "http://192.168.0.51/image/jpeg.cgi"

exports.handle = function(sender, pieces, storageFactory, callback, moduleName, client) {

    var options = {
        directory: "/tmp/",
        filename: "camera-1.jpg"
    }

    download(url, options, function(err){
        if (err) {
            callback({'message': "Can't download image from " + url});
            return;
        }

        callback({file:'/tmp/camera-1.jpg', filename: 'Camera.jpg'});
    });
};

