// Initialize Firebase
var firebase = require('firebase');
var config = {
// your firebase config
};
module.exports.firebase = firebase.initializeApp(config, 'instagram-api-node');

module.exports.Instagram = require('./lib/instagram.js');
module.exports.Bot = require('./lib/bot/');
module.exports.utils = require('./lib/utils');

// var api = new this.Instagram('username', "password");
// var self = this;
// (async function () {
//   await api.login();
//   var bot = new self.Bot(api).start()
// })();


