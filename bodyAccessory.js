var Accessory, Service, Characteristic, UUIDGen;
//var debug = false;
var utils = require('./utils.js')

var PoolBodyAccessory = function(log, accessory, bodyData, homebridge, platform) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  Homebridge = homebridge;
  debug = platform.debug;

  this.accessory = accessory;
  this.log = log;

/*
  this.circuit = circuit;
  this.circuitState = circuitState;
  this.bodySetPoint = bodySetPoint
  this.bodyTemp = bodyTemp
  this.bodyHeatMode = bodyHeatMode
  this.bodyHeatStatus = bodyHeatStatus
 */
  this.bodyData = bodyData
  this.platform = platform

  this.service = accessory.getService(Service.Switch);
  if (this.service) {
    this.service
      .getCharacteristic(Characteristic.On)
      .on('set', this.setCircuitState.bind(this))
      .on('get', this.getCircuitState.bind(this));
   }

  this.service = accessory.getService(Service.TemperatureSensor);
  if (this.service) {
    this.service  
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemp.bind(this));
    }

    this.service = accessory.getService(Service.Thermostat);
    if (this.service) {
      this.service
        .getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.getThermoCurrTemp.bind(this));

        this.service
        .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .on('get', this.getThermoState.bind(this));

//        this.service
//        .getCharacteristic(Characteristic.TargetHeatingCoolingState)
//        .on('set', this.setThermoTargetState.bind(this))
//        .on('get', this.getThermoTargetState.bind(this));

        this.service
        .getCharacteristic(Characteristic.TargetTemperature)
        .on('set', this.setThermoTargetTemp.bind(this))
        .on('get', this.getThermoTargetTemp.bind(this));

        
      }
  this.updateState(bodyData)

  // not needed/used with latest HomeKit API's
  // accessory.updateReachability(true);
}

PoolBodyAccessory.prototype.getThermoCurrTemp = function(callback) {
  callback(null, utils.F2C(this.bodyTemp));
};

PoolBodyAccessory.prototype.getThermoTargetTemp = function(callback) {
  callback(null, utils.F2C(this.bodySetPoint));
};

PoolBodyAccessory.prototype.getCurrentTemp = function(callback) {
  callback(null, utils.F2C(this.bodyTemp));
};

PoolBodyAccessory.prototype.getThermoState = function(callback) {
  callback(null, utils.HeatingState(this.bodyData.heatStatus, Characteristic));
};

PoolBodyAccessory.prototype.setThermoTargetTemp = function(newSetPoint, callback) {
  if (this.bodyData.setPoint !== utils.F2C(newSetPoint)) {

    if (this.debug) this.log("Setting Body Setpoint", this.accessory.displayName, "to", utils.F2C(newSetPoint));
    var data
    data.body.id = this.bodyData.circuit
    data.body.setPoint = this.bodyData.bodySetPoint

    //this.socket.emit("toggleCircuit", this.circuit);
    this.platform.execute("setHeatSetPoint", data)
    this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetTemperature).updateValue(newSetPoint);

  }
  callback();
};

PoolBodyAccessory.prototype.setCircuitState = function(newCircuitState, callback) {
  if (this.bodyData.isOn !== newCircuitState) {

    if (this.debug) this.log("Setting Body", this.accessory.displayName, "to", newCircuitState);
    this.platform.execute("toggleCircuit", {id: this.bodyData.circuit})
    //    this.socket.emit("toggleCircuit", this.circuit);
    //this.updateCircuitState(circuitState);
    //this following line will update the value without the internal callback to getCircuitState
    this.accessory.getService(Service.Switch).getCharacteristic(Characteristic.On).updateValue(newCircuitState);

  }

  callback();

};

PoolBodyAccessory.prototype.getCircuitState = function(callback) {
  callback(null, this.bodyData.isOn);
};

// For when state is changed elsewhere.
PoolBodyAccessory.prototype.updateState = function(newbodyData) {

    this.bodyData = newbodyData;

    this.accessory.getService(Service.Switch).getCharacteristic(Characteristic.On)
      .updateValue(this.bodyData.isOn); 

    this.accessory.getService(Service.TemperatureSensor).getCharacteristic(Characteristic.CurrentTemperature)
      .updateValue(utils.F2C(this.bodyData.temp))

      this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.CurrentTemperature)
      .updateValue(utils.F2C(this.bodyData.temp))

      this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetTemperature)
      .updateValue(utils.F2C(this.bodyData.setPoint))

      this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .updateValue(utils.HeatingState(this.bodyData.heatStatus, Characteristic))

      this.accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .updateValue(utils.HeatingMode(this.bodyData.heatMode, Characteristic))

  return
}

module.exports = PoolBodyAccessory;
