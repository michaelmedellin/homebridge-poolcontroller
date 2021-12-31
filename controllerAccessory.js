var Accessory, Service, Characteristic, UUIDGen;

var PoolControllerAccessory = function(log, accessory, controllerData, homebridge, platform) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  Homebridge = homebridge;

  var customtypes = require('./customTypes.js')
  var CustomTypes = new customtypes(Homebridge)

  this.accessory = accessory;
  this.log = log;
  this.controllerData = controllerData

  this.service = accessory.getService(Service.ContactSensor);
  this.platform = platform;
  this.debug = platform.debug;

  if (this.service) {
    this.service
      .getCharacteristic(Characteristic.ContactSensorState)
      .on('get', this.getDelayState.bind(this));

    this.service
    .getCharacteristic(CustomTypes.controllerMode)
    .on('get', this.getControllerMode.bind(this))

    this.service
    .getCharacteristic(CustomTypes.delayReason)
    .on('get', this.getDelayReason.bind(this))
    }

    this.updateState(controllerData)
  // not needed/used with latest HomeKit API's
  // accessory.updateReachability(true);
}


PoolControllerAccessory.prototype.getDelayState = function(callback) {
  callback(null, this.controllerData.delay.val == 32 ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
};


PoolControllerAccessory.prototype.getControllerMode = function(callback) {
  callback(null, this.controllerData.mode.desc);
};

PoolControllerAccessory.prototype.getDelayReason = function(callback) {
  callback(null, this.controllerData.delay.desc);
};

// For when state is changed elsewhere.
PoolControllerAccessory.prototype.updateState = function(newcontrollerData) {
  var customtypes = require('./customTypes.js')
  var CustomTypes = new customtypes(Homebridge)
  
  this.controllerData = newcontrollerData;
    this.accessory.getService(Service.ContactSensor).getCharacteristic(Characteristic.ContactSensorState).updateValue(this.controllerData.delay.val == 32 ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED); 
//    this.accessory.getService(Service.ContactSensor).getCharacteristic(CustomTypes.controllerMode).updateValue(this.controllerData.mode.desc); 
//    this.accessory.getService(Service.ContactSensor).getCharacteristic(CustomTypes.delayReason).updateValue(this.controllerData.delay.desc); 
  return
};

module.exports = PoolControllerAccessory;
