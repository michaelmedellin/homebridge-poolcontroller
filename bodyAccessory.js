var Accessory, Service, Characteristic, UUIDGen;
//var debug = false;
var utils = require('./utils.js')
var moment = require('moment');

var PoolBodyAccessory = function (log, accessory, bodyData, homebridge, platform) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  Homebridge = homebridge;

  this.accessory = accessory;
  this.log = log;
  this.accessory.log = log;
  this.bodyData = bodyData
  this.platform = platform

  var customtypes = require('./customTypes.js')
  var CustomTypes = new customtypes(Homebridge)
  var FakeGatoHistoryService = require('fakegato-history')(homebridge);
  this.loggingService = new FakeGatoHistoryService("thermo", this.accessory, { size: 11520, disableTimer: true, storage: 'fs' });


  this.service = accessory.getService(Service.Switch);
  if (this.service) {
    this.service
      .getCharacteristic(Characteristic.On)
      .on('set', this.setCircuitState.bind(this))
      .on('get', this.getCircuitState.bind(this));
  }

  /*
   this.service = accessory.getService(Service.TemperatureSensor);
  if (this.service) {
    this.service  
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemp.bind(this));
    }
*/
  this.service = accessory.getService(Service.Thermostat);
  if (this.service) {
    this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getThermoCurrTemp.bind(this));

    this.service
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .on('get', this.getThermoState.bind(this));

    this.service
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('set', this.setThermoTargetState.bind(this))
      .on('get', this.getThermoTargetState.bind(this));

    this.service
      .getCharacteristic(Characteristic.TargetTemperature)
      .on('set', this.setThermoTargetTemp.bind(this))
      .on('get', this.getThermoTargetTemp.bind(this));


  }
  this.updateState(bodyData)

  // not needed/used with latest HomeKit API's
  // accessory.updateReachability(true);
}

PoolBodyAccessory.prototype.setCircuitState = async function (newCircuitState, callback) {
  if (this.bodyData.isOn !== newCircuitState) {

    if (this.platform.LogLevel >= 3) this.log("Setting Body", this.accessory.displayName, "to", newCircuitState);
    await this.platform.execute("toggleCircuit", { id: this.bodyData.circuit })
    this.accessory.getService(Service.Switch).getCharacteristic(Characteristic.On).updateValue(newCircuitState);

  }

  callback();

};

// Temp Sensor

PoolBodyAccessory.prototype.getCircuitState = function (callback) {
  callback(null, this.bodyData.isOn);
};

PoolBodyAccessory.prototype.getCurrentTemp = function (callback) {
  callback(null, utils.F2C(this.bodyData.temp));
};

// Thermostat

PoolBodyAccessory.prototype.getThermoCurrTemp = function (callback) {
  callback(null, utils.F2C(this.bodyData.temp));
};

PoolBodyAccessory.prototype.getThermoTargetTemp = function (callback) {
  callback(null, utils.F2C(this.bodyData.setPoint));
};

PoolBodyAccessory.prototype.setThermoTargetTemp = function (newSetPoint, callback) {
  if (this.bodyData.setPoint !== utils.C2F(newSetPoint)) {

    if (this.platform.LogLevel >= 3) this.log("Setting Body Setpoint", this.accessory.displayName, "to", Math.round(utils.C2F(newSetPoint)));

    this.platform.execute("setHeatSetPoint", { id: this.bodyData.id, setPoint: utils.C2F(newSetPoint) })
    this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetTemperature).updateValue(utils.F2C(Math.round(utils.F2C(newSetPoint))));

  }
  callback();
};

PoolBodyAccessory.prototype.getThermoState = function (callback) {
  callback(null, utils.HeatingState(this.bodyData.heatStatus, Characteristic));
};

PoolBodyAccessory.prototype.getThermoTargetState = function (callback) {
  callback(null, utils.HeatingMode(this.bodyData.heatMode, Characteristic));
};

PoolBodyAccessory.prototype.setThermoTargetState = async function (newTargetState, callback) {
  if (this.platform.LogLevel >= 3) this.log("Setting Body Target State", this.accessory.displayName, "to", newTargetState);

  await this.platform.execute("setHeatMode", { id: this.bodyData.id, mode: utils.HK_Mode(newTargetState, Characteristic) })
  this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetTemperature).updateValue(newTargetState);

  callback();
};

// For when state is changed elsewhere.
PoolBodyAccessory.prototype.updateState = function (newbodyData) {
  var customtypes = require('./customTypes.js')
  var CustomTypes = new customtypes(Homebridge)


  this.bodyData = newbodyData;

  if (this.platform.LogLevel >= 3)
    this.log('Updating data for %s body: state: %s', newbodyData.name, newbodyData.isOn)

  if (this.platform.LogLevel >= 4)
    this.log('Additional data for %s body: Curr temp: %s, target temp: %s, current state: %s, target state: %s', newbodyData.name, newbodyData.temp, newbodyData.setPoint, newbodyData.heatStatus.desc, newbodyData.heatMode.desc)

  this.accessory.getService(Service.Switch).getCharacteristic(Characteristic.On)
    .updateValue(this.bodyData.isOn);

  //    this.accessory.getService(Service.TemperatureSensor).getCharacteristic(Characteristic.CurrentTemperature)
  //      .updateValue(utils.F2C(this.bodyData.temp))

  this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.CurrentTemperature)
    .updateValue(utils.F2C(this.bodyData.temp))

  this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetTemperature)
    .updateValue(utils.F2C(this.bodyData.setPoint))

  this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.CurrentHeatingCoolingState)
    .updateValue(utils.HeatingState(this.bodyData.heatStatus, Characteristic))

  this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetHeatingCoolingState)
    .updateValue(utils.HeatingMode(this.bodyData.heatMode, Characteristic))

  this.loggingService.addEntry({ time: moment().unix(), currentTemp: utils.F2C(this.bodyData.temp), setTemp: utils.F2C(this.bodyData.setPoint), valvePosition: this.bodyData.heatStatus.val });
  var interval = 8 * 60 * 1000
  clearTimeout(this.bodyTempTimer)
  this.bodyTempTimer = setInterval(function (platform, loggingService, accessory, tempData, setPoint, heatState) {
    if (platform.LogLevel >= 4) platform.log('Adding body temp log entry %s %s %s', tempData, setPoint, heatState * 100)
    loggingService.addEntry({ time: moment().unix(), currentTemp: tempData, setTemp: setPoint, valvePosition: heatState });

  }, interval, this.platform, this.accessory, this.loggingService, utils.F2C(this.bodyData.temp), utils.F2C(this.bodyData.setPoint), this.bodyData.heatStatus.val)

  return
}

module.exports = PoolBodyAccessory;
