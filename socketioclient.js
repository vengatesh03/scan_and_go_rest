var Clientsocket={};
var data={serial_number:'1234'}
const io = require("socket.io-client"),
    ioClient = io.connect("https://app.skie.tv/?serial=12345");

Clientsocket.initiateAppUpdate=function(data){
  ioClient.emit("initiate_ota",data)
}

Clientsocket.runCommand=function(data){
  ioClient.emit("run_cmd",data)
}

Clientsocket.updateOTA=function(data){
  ioClient.emit("initiate_ota_update",data)
}


module.exports = Clientsocket;
