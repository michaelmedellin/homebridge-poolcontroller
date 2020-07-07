var Accessory, Service, Characteristic, UUIDGen;
//var debug = false;
var utils = require('./utils.js')
var moment = require('moment');

var PoolTempAccessory = function(log, accessory, tempData, homebridge, platform) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  Homebridge = homebridge;

  this.accessory = accessory;
  this.log = log;
  this.accessory.log = log

  var customtypes = require('./customTypes.js')
  var CustomTypes = new customtypes(Homebridge)
  var FakeGatoHistoryService = require('fakegato-history')(homebridge);
  this.loggingService = new FakeGatoHistoryService("weather", this.accessory, {size:11520,disableTimer:true,storage:'fs'});


  this.tempData = tempData
  this.platform = platform
  this.debug = platform.debug;

  this.service = accessory.getService(Service.TemperatureSensor);
  if (this.service) {
    this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrTemp.bind(this));

    }

    
  this.updateState(tempData)

  // not needed/used with latest HomeKit API's
  // accessory.updateReachability(true);
}


PoolTempAccessory.prototype.getCurrTemp = function(callback) {
  callback(null, utils.F2C(this.tempData));
};

// For when state is changed elsewhere.
PoolTempAccessory.prototype.updateState = function(newtempData) {
  var customtypes = require('./customTypes.js')
  var CustomTypes = new customtypes(Homebridge)
  
    this.tempData = newtempData;
    if (this.debug) {
    this.log('Updating temp to ', this.tempData)
    }

    this.accessory.getService(Service.TemperatureSensor).getCharacteristic(Characteristic.CurrentTemperature)
      .updateValue(utils.F2C(this.tempData)); 

      this.loggingService.addEntry({time: moment().unix(), temp: utils.F2C(this.tempData)});

      var interval = 5 * 60 * 1000
      clearTimeout(this.tempUpdateTimer)
      this.tempUpdateTimer = setInterval(function(platform, loggingService, tempData) {
          loggingService.addEntry({time: moment().unix(), temp: utils.F2C(tempData)})
      }, interval, this.platform, this.loggingService, this.tempData)

  return
}

module.exports = PoolTempAccessory;
