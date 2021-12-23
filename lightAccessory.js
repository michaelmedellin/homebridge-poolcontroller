var Accessory, Service, Characteristic, UUIDGen;

var PoolCircuitAccessory = function (log, accessory, circuit, circuitState, homebridge, platform) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  Homebridge = homebridge;

  this.accessory = accessory;
  this.log = log;
  this.accessory.log = log;
  this.circuit = circuit;
  this.circuitState = circuitState;
  this.platform = platform;
  this.debug = platform.debug

  var customtypes = require('./customTypes.js')
  var CustomTypes = new customtypes(Homebridge)
  var FakeGatoHistoryService = require('fakegato-history')(homebridge);
  this.loggingService = new FakeGatoHistoryService("custom", this.accessory, { size: 11520, disableTimer: true, storage: 'fs' });

  this.service = this.accessory.getService(Service.Lightbulb);
  if (this.service) {
    this.service
      .getCharacteristic(Characteristic.On)
      .on('set', this.setCircuitState.bind(this))
      .on('get', this.getCircuitState.bind(this));
  }
  this.updateState(circuitState)
  // not needed/used with latest HomeKit API's
  // accessory.updateReachability(true);
}

PoolCircuitAccessory.prototype.setCircuitState = async function (circuitState, callback) {
  if (this.platform.LogLevel >= 3) this.log("Setting Circuit", this.accessory.displayName, "to", circuitState, " from ", this.circuitState);

  if (this.circuitState !== circuitState) {
    await this.platform.execute("toggleCircuit", { id: this.circuit })
    this.accessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On).updateValue(circuitState);

  }
  this.loggingService.addEntry({ time: Math.round(new Date().valueOf() / 1000), status: circuitState });
  callback();

};

PoolCircuitAccessory.prototype.getCircuitState = function (callback) {
  callback(null, this.circuitState);
};

// For when state is changed elsewhere.
PoolCircuitAccessory.prototype.updateState = function (circuitState) {
  if (this.circuitState !== circuitState) {
    if (this.platform.LogLevel >= 3) this.log("Update Light State for %s (state: %s-->%s)", this.accessory.displayName, this.circuitState, circuitState)
    this.circuitState = circuitState;

    // since this is being called internally (via the socket initiation), call the function that will call the callback
    //this.accessory.getService(Service.Lightbulb).setCharacteristic(Characteristic.On, circuitState) // DO NOT USE - creates an infinite loop

    // this.accessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On).setValue(circuitState) // works
    this.accessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On).updateValue(circuitState); // works
    //this.service.getCharacteristic(Characteristic.On).setValue(this.circuitState); // works

  } else {
    //console.log("No change in state for %s", this.accessory.displayName)
  }
  
  this.loggingService.addEntry({ time: Math.round(new Date().valueOf() / 1000), status: circuitState });
  
  var interval = 8 * 60 * 1000
  clearTimeout(this.circuitTimer)
  this.circuitTimer = setInterval(function (platform, loggingService, accessoryName, switchState) {
    if (platform.LogLevel >= 4) platform.log('Adding circuit log entry %s: %s', accessoryName, switchState)
    loggingService.addEntry({ time: Math.round(new Date().valueOf() / 1000), status: switchState });
  
  }, interval, this.platform, this.loggingService, this.accessory.displayName, circuitState)

  return
};

module.exports = PoolCircuitAccessory;
