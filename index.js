var Accessory, Service, Characteristic, UUIDGen, Homebridge;
var io = require('socket.io-client');
var ssdp = require('node-ssdp').Client
var socket;
var circuitAccessory = require('./circuitAccessory.js');
var lightAccessory = require('./lightAccessory.js');
var bodyAccessory = require('./bodyAccessory.js');
var utils = require('./utils.js')

module.exports = function (homebridge) {
    //check homebridge version

    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    Homebridge = homebridge;
    
    homebridge.registerPlatform("homebridge-PoolControllerPlatform", "PoolControllerPlatform", PoolControllerPlatform, true);
};

function PoolControllerPlatform(log, config, api) {
    var self = this;
    log("Loading PoolControllerPlatform");
    self.log = log;
    self.config = config;
    self.accessories = {};
    self.skipAllUnInit = self.config.skipAllUnInit;
    self.skipCircuitNames = self.config.skipCircuitNames || [];
    self.debug = self.config.debug

    if (self.skipAllUnInit==undefined) self.skipAllUnInit = true;
    if (self.debug==undefined) self.debug = false;

    //check config here.
    //check pool controller version

    if (api) {
        self.api = api;
        self.api.on('didFinishLaunching', self.SSDPDiscovery.bind(this));
    }
}

PoolControllerPlatform.prototype.SSDPDiscovery = function () {
    var self = this
    var elapsedTime = 0;
    if (self.config.ip_address === '*') {
        var client = new ssdp({})
        self.log('Starting UPnP search for PoolController.')

        client.on('response', function inResponse(headers, code, rinfo) {
            //console.log('Got a response to an m-search:\n%d\n%s\n%s', code, JSON.stringify(headers, null, '  '), JSON.stringify(rinfo, null, '  '))
            if (headers.ST === 'urn:schemas-upnp-org:device:PoolController:1') {
                self.config.ip_address = headers.LOCATION.replace('/device','');
                self.log('Found nodejs-poolController at %s.', self.config.ip_address)
                client.stop()
                clearTimeout(timer)
                self.validateVersion(headers.LOCATION)
            }
        })

        client.search('urn:schemas-upnp-org:device:PoolController:1')

        //Or maybe if you want to scour for everything after 5 seconds
        timer = setInterval(function () {
            elapsedTime += 5;
            client.search('urn:schemas-upnp-org:device:PoolController:1')
            self.log('Can not find nodejs-PoolController after %s seconds.', elapsedTime)
        }, 5000)

    } else {
      self.validateVersion(self.config.ip_address);
    }
}

PoolControllerPlatform.prototype.validateVersion = function (URL) {
    var self = this;
    var request = require('request')
        , valid = false
        , validMajor = 4
        , validMinor = 1
    request(URL + "/device", function (error, response, body) {
        if (error)
            self.log('Error retrieving configuration from poolController.', error)
        else {
            var major = parseInt(body.match("<major>(.*)</major>")[1])
            var minor = parseInt(body.match("<minor>(.*)</minor>")[1])
            if (major > validMajor)
                valid = true
            else if (major === validMajor && minor >= validMinor)
                valid = true
            if (valid) {
                self.log("Version checked OK, getting config data");
                request(URL + "/state/all", function (error, response, body) {
                    if (error)
                        self.log('Error retrieving initial state from poolController.', error)
                    else {
                        data = JSON.parse(body)
                    }
                    socket = io.connect(self.config.ip_address, {
                        secure: self.config.secure,
                        reconnect: true,
                        rejectUnauthorized: false
                    });
                    socket.on('connection', function () {
                        self.log('homebridge-poolcontroller connected to the server')
                    })
                    socket.on('connect_error', function () {
                        self.log('ERROR: homebridge-poolcontroller can NOT find the pool controller')
                    })
                    socket.on('error', function (data) {
                        console.log('Socket error:', data)
                    });
                                
                    self.InitialData(data);
                })
        }
            else {
                self.log.error('Version of poolController %s.%s does not meet the minimum for this Homebridge plugin %s.%s', major, minor, validMajor, validMinor)
                process.exit()
            }
        }
    })


}

PoolControllerPlatform.prototype.InitialData = function (data) {
//    this.log("Got config packet")
    if (this.debug) this.log("InitialData: ", data);
    var circuitData = data.circuits.concat(data.features)
    var addCircuit = true
    var bodyData = data.temps.bodies
    var tempData = data.temps

//    this.log("Count of circuits", circuitData)
    for (var i in circuitData) {
        addCircuit=true

        if (circuitData[i].name == "NOT USED" || circuitData[i].type.name.toLowerCase() == "spa" || circuitData[i].type.name.toLowerCase() == "pool") {
            addCircuit = false
        }

        if (this.skipAllUnInit && circuitData[i].name.substr(0,3)=="AUX") {
            addCircuit = false
        }

        if (this.skipAllUnInit && circuitData[i].name.substr(0,7).toLowerCase()=="feature") {
            addCircuit = false
        }

        if (this.skipCircuitNames.includes(circuitData[i].name)) {
            addCircuit = false
        }

        var circuitNumber = circuitData[i].id;
        var circuitFunction = circuitData[i].type.name.toLowerCase();
        var circuitName = circuitData[i].name;
        var circuitState = circuitData[i].isOn;

        if (addCircuit==false)
            if (this.debug) this.log('Skipping circuit/accessory %s', circuitName)
        if (addCircuit) {

            var id = "poolController." + circuitNumber + "." + circuitName; //added circuitName because circuit numbers will never change.  Changing the name will trigger a new UUID/device.

            var uuid = UUIDGen.generate(id);
            var cachedAccessory = this.accessories[uuid];

            // type === light
            if (['intellibrite', 'light', 'sam light', 'sal light', 'color wheel'].indexOf(circuitFunction) >= 0) {
                if (cachedAccessory === undefined) {
                    if (this.debug) this.log('Creating new light accessory: circuitNumber: %s, id: %s', circuitNumber, id)
                    this.addLightAccessory(this.log, id, circuitName, circuitNumber, circuitState, this);
                } else {
                    if (this.debug) this.log('Adding cached light accessory: circuitNumber: %s, id: %s', circuitNumber, id)
                    this.accessories[uuid] = new lightAccessory(this.log, cachedAccessory, circuitNumber, circuitState, Homebridge, this);
                }
            } else {
                if (cachedAccessory === undefined) {
                    if (this.debug) this.log('Creating new circuit accessory: circuitNumber: %s, id: %s', circuitNumber, id)
                    this.addCircuitAccessory(this.log, id, circuitName, circuitNumber, circuitState, this);
                } else {
                    if (this.debug) this.log('Using cached circuit accessory: circuitNumber: %s, id: %s', circuitNumber, id)
                    this.accessories[uuid] = new circuitAccessory(this.log, cachedAccessory, circuitNumber, circuitState, Homebridge, this);
                    }
                }
            }        
        }

        for (var i in bodyData) {

            var bodyNumber = bodyData[i].circuit
            var bodyName = bodyData[i].name
            var id = "poolController." + bodyNumber + "." + bodyName; //added circuitName because circuit numbers will never change.  Changing the name will trigger a new UUID/device.
            var uuid = UUIDGen.generate(id);
            var cachedAccessory = this.accessories[uuid];

            if (cachedAccessory === undefined) {
                if (this.debug) this.log('Adding new body: %s', bodyName)

                this.addBodyAccessory(this.log, id, bodyName, bodyData[i], this );
            } else {
                if (this.debug) this.log('Using cached body: %s', bodyName)

                this.accessories[uuid] = new bodyAccessory(this.log, cachedAccessory, bodyData[i], Homebridge, this)
            }

        }

        var id = "poolController.0.Controller"; 
        var uuid = UUIDGen.generate(id);
        var cachedAccessory = this.accessories[uuid];
/*        
        if (cachedAccessory === undefined) 
            this.addControllerAccessory(this.log, id, tempData , data.freeze, data.mode, data.pumps, socket, this );
        else {
            if (debug) this.log('Adding cached body: %s', bodyName)
            this.accessories[uuid] = new controllerAccessory(this.log, cachedAccessory, tempData , Homebridge, socket, this)
        }
*/

    socket.on('circuit', this.socketCircuitUpdated.bind(this));
    socket.on('feature', this.socketCircuitUpdated.bind(this)); 
    socket.on('body', this.socketbodyUpdated.bind(this));
    socket.on('temps', this.socketTempsUpdated.bind(this));
//    socket.on('controller', this.socketControllerUpdated.bind(this));
//    socket.on('pump', this.socketPumpUpdated.bind(this));

};

PoolControllerPlatform.prototype.socketTempsUpdated = function (tempData) {
    if (debug) this.log('FROM TEMP CLIENT: ' + JSON.stringify(tempData, null, "\t"));
    allbodyData = tempData.bodies

    for (var i in allbodyData) {
        if (this.debug) this.log('Updating temp (and all) data for body: ', allbodyData[i].name)
        this.socketbodyUpdated(allbodyData[i])
    }
    /*
    temperatureData = temperatureData.temperature
    for (var uuid in this.accessories) {
        //console.log("Analyzing temperature %s of %s", i, Object.keys(temperatureData).length)
        if ((this.accessories[uuid].accessory.displayName).includes('Heater')) {
            this.accessories[uuid].updateTemperatureState(temperatureData); // All heaters should have a temperature state associated to them.
        }
    }
*/
    

};


PoolControllerPlatform.prototype.socketControllerUpdated = function (controllerData) {
//    if (debug) this.log('FROM CONTROLLER CLIENT: ' + JSON.stringify(controllerData, null, "\t"));
    

};

PoolControllerPlatform.prototype.socketPumpUpdated = function (pumpData) {
    if (this.debug) this.log('FROM PUMP CLIENT: ' + JSON.stringify(pumpData, null, "\t"));
    

};

PoolControllerPlatform.prototype.socketCircuitUpdated = function (circuitData) {
    if (this.debug) this.log('FROM CIRCUIT CLIENT: ' + JSON.stringify(circuitData, null, "\t"));
    var circuitNumber = circuitData.id;
    var circuitFunction = circuitData.type.name.toLowerCase();
    var circuitName = circuitData.name;
    var circuitState = circuitData.isOn;
    var updateCircuit=true

    if (circuitName == "NOT USED" || circuitFunction == "spa" || circuitFunction == "pool") {
        updateCircuit = false
    }

    if (this.skipAllUnInit && circuitName.substr(0,3)=="AUX") {
        updateCircuit = false
    }

    if (this.skipAllUnInit && circuitName.substr(0,7).toLowerCase()=="feature") {
        updateCircuit = false
    }

    if (this.skipCircuitNames.includes(circuitName)) {
        updateCircuit = false
    }

    if (updateCircuit) {
        var id = "poolController." + circuitNumber + "." + circuitName; //added circuitName because circuit numbers will never change.  Changing the name will trigger a new UUID/device.

        var uuid = UUIDGen.generate(id);
        var cachedAccessory = this.accessories[uuid];
        if (cachedAccessory !== undefined) {
            cachedAccessory.updateState(circuitState)
        }

    }
};

PoolControllerPlatform.prototype.socketbodyUpdated = function (bodyData) {
    if (this.debug) this.log('FROM BODY CLIENT: ' + JSON.stringify(bodyData, null, "\t"));
    var id = "poolController." + bodyData.circuit + "." + bodyData.name; //added circuitName because circuit numbers will never change.  Changing the name will trigger a new UUID/device.

    var uuid = UUIDGen.generate(id);
    var cachedAccessory = this.accessories[uuid];
    if (cachedAccessory !== undefined) {
        cachedAccessory.updateState(bodyData)
    }

}

PoolControllerPlatform.prototype.configureAccessory = function (accessory) {
    accessory.reachable = false; // Don't allow accessories to be controlled until we associate circuits/circuitState to them.
    this.accessories[accessory.UUID] = accessory; // Throw it into dictionary to be updated with initial data.
    console.log('%s (%s) - added to local current array from cache with UUID:%s ', accessory.displayName, accessory.id, accessory.UUID);
};

PoolControllerPlatform.prototype.addCircuitAccessory = function (log, identifier, accessoryName, circuit, power, platform) {
    var uuid = UUIDGen.generate(identifier);
    var accessory = new Accessory(accessoryName, uuid);
    accessory.addService(Service.Switch, accessoryName);

    this.accessories[uuid] = new circuitAccessory(log, accessory, circuit, power, Homebridge, platform);
    this.api.registerPlatformAccessories("homebridge-PoolControllerPlatform", "PoolControllerPlatform", [accessory]);

    //get this info from socket? does it matter? also model and serial.
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Pentair");

};

PoolControllerPlatform.prototype.addBodyAccessory = function (log, identifier, accessoryName, bodyData, platform) {
    var uuid = UUIDGen.generate(identifier);
    var accessory = new Accessory(accessoryName, uuid);
    accessory.addService(Service.Switch, accessoryName);
    accessory.addService(Service.TemperatureSensor, accessoryName + " Temp");
    accessory.addService(Service.Thermostat, accessoryName + " Heater");


    this.accessories[uuid] = new bodyAccessory(log, accessory, bodyData, Homebridge, platform);
    this.api.registerPlatformAccessories("homebridge-PoolControllerPlatform", "PoolControllerPlatform", [accessory]);

    accessory.getService(Service.TemperatureSensor).setCharacteristic(Characteristic.TemperatureDisplayUnits, Characteristic.TemperatureDisplayUnits.FAHRENHEIT)
    accessory.getService(Service.Thermostat).setCharacteristic(Characteristic.TemperatureDisplayUnits, Characteristic.TemperatureDisplayUnits.FAHRENHEIT)
    accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetTemperature)
        .setProps({
            minValue: utils.F2C(40),
            maxValue: utils.F2C(104),
            minStep: 1
      });
      
      accessory.getService(Service.Thermostat).getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .setProps({
          maxValue: Characteristic.TargetHeatingCoolingState.HEAT
        })
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Pentair");
};

PoolControllerPlatform.prototype.addControllerAccessory = function (log, identifier, accessoryName, circuit, power, platform) {
    var uuid = UUIDGen.generate(identifier);
    var accessory = new Accessory(accessoryName, uuid);
    accessory.addService(Service.TemperatureSensor, "Air temp");
    accessory.addService(Service.TemperatureSensor, "Water body temp");
//    accessory.addService(Service.)
    this.accessories[uuid] = new lightAccessory(log, accessory, circuit, power, Homebridge, platform);
    this.api.registerPlatformAccessories("homebridge-PoolControllerPlatform", "PoolControllerPlatform", [accessory]);

    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Pentair");

};

PoolControllerPlatform.prototype.addLightAccessory = function (log, identifier, accessoryName, circuit, power, platform) {
    var uuid = UUIDGen.generate(identifier);
    var accessory = new Accessory(accessoryName, uuid);
    accessory.addService(Service.Lightbulb, accessoryName);

    this.accessories[uuid] = new lightAccessory(log, accessory, circuit, power, Homebridge, platform);
    this.api.registerPlatformAccessories("homebridge-PoolControllerPlatform", "PoolControllerPlatform", [accessory]);

    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Pentair");

};

PoolControllerPlatform.prototype.execute = async function (action, data)  {
    const axios = require('axios').default;
    var poolURL = this.config.ip_address
    this.log("Executing request - server: %s, command: %s, data:", poolURL, action, data)

    let opts={
            method: 'put',
            data: data
        }
        switch(action) {
            // CIRCUITS
            case 'setCircuitState':
                opts.url=`${ poolURL }/state/circuit/setState`
                break;
            case 'deleteCircuit':
                opts.url=`${ poolURL }/config/circuit`
                opts.method='DELETE';
                break;
            case 'setCircuit':
                opts.url=`${ poolURL }/config/circuit`
                break;
            case 'toggleCircuit':
                opts.url = `${poolURL}/state/circuit/toggleState`;
                break
            // DATE TIME
            case 'setDateTime':
                opts['url']=`${ poolURL }/config/dateTime`;
                break;
            // HEAT MODES
            case 'setHeatMode':
                opts.url=`${ poolURL }/state/body/heatMode`
                break;
            case 'setHeatSetPoint':
                opts.url=`${ poolURL }/state/body/setPoint`
                break;
            case 'toggleHeatMode':
                opts.url=`${ poolURL }/state/circuit/toggleState`
                break;
            // CHLORINATOR
            case 'chlorSearch':
                opts.method = 'get'
                opts.url=`${ poolURL }/config/chlorinators/search`
                break;
            case 'setChlor':
                opts.url=`${ poolURL }/state/chlorinator/setChlor`
                break;
            // APP OPTIONS
            case 'setAppLoggerOptions':
                opts.url=`${ poolURL }/app/logger/setOptions`
                break;
            case 'startPacketCapture':
                opts.method = 'get'
                opts.url = `${ poolURL }/app/config/startPacketCapture`
                break;
            case 'startPacketCaptureWithoutReset':
                opts.method = 'get'
                opts.url = `${ poolURL }/app/config/startPacketCaptureWithoutReset`
                break;
            case 'stopPacketCapture':
                opts.method = 'get'
                opts.responseType = 'blob'
                opts.url = `${ poolURL }/app/config/stopPacketCapture`
                break;
            // LIGHT GROUPS
            case 'setLightGroupTheme':
                opts.url=`${ poolURL }/state/circuit/setTheme`
                break;
            case 'setLightGroupAttribs':
                opts.url=`${ poolURL }/config/lightGroup`
                break;
            case 'configLightGroup':
                opts.url=`${ poolURL }/config/lightGroup`
                break;
            // UTILITIES
            default:
                console.log(`missing API call ${action}`)
                return Promise.reject(`missing API call ${action}`)
        }
        try {
            if (this.debug) this.log('Sending command to pool controller server: ', opts)
            let res=await axios(opts);
            return res.data;
        }
        catch (err){
            console.log(`Error fetching data: ${err.message}`);
            return Promise.reject(err);
        }

};
  