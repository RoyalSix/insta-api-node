const { DEVICES } = require('../../static/constants');
const { randomIntFromInterval } = require('./../utils.js');
const REQUIRED_ANDROID_VERSION = '2.2';

function Device(deviceString = null, autoFallback = true) {
  this.deviceString = deviceString;
  // Use the provided device if a valid good device. Otherwise use random.
  if (autoFallback && !deviceString || !this.isGoodDevice(deviceString)) {
    this.deviceString = this.getRandomGoodDevice();
  }
  this.userAgent = this.deviceString;
  // Initialize ourselves from the device string.
}

Device.prototype = {}

Device.prototype.getRandomGoodDevice = function () {
  var lengthOfDevices = DEVICES.length - 1;
  return DEVICES[randomIntFromInterval(0, lengthOfDevices)];
}

Device.prototype.isGoodDevice = function (deviceToCheck) {
  return DEVICES.includes(deviceToCheck);
}

module.exports = Device;

