var Accessory, Service, Characteristic, UUIDGen, Homebridge;
var io = require('socket.io-client');
var ssdp = require('node-ssdp').Client
var socket;
var circuitAccessory = require('./circuitAccessory.js');
var lightAccessory = require('./lightAccessory.js');
var bodyAccessory = require('./bodyAccessory.js');
var pumpAccessory = require('./pumpAccessory.js');
var controllerAccessory = require('./controllerAccessory.js')
var tempAccessory = require('./tempAccessory.js')

const PLUGIN_NAME = 'homebridge-poolcontroller';
const PLATFORM_NAME = 'PoolControllerPlatform';

var utils = require('./utils.js')

module.exports = function (homebridge) {
    //check homebridge version

    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    Homebridge = homebridge;

    homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, PoolControllerPlatform, true);
};

function PoolControllerPlatform(log, config, api) {

    var self = this;
    log("Loading PoolControllerPlatform");
    self.log = log;
    self.config = config;
    self.accessories = {};
    self.skipAllUnInit = self.config.skipAllUnInit;
    self.skipCircuitNames = self.config.skipCircuitNames || [];
    self.SupressWaterSensor = self.config.SupressWaterSensor || false;

    if (this.config.LogLevel == undefined) { this.LogLevel = 3 }
    else {
        switch (this.config.LogLevel) {
            case "debug":
                this.LogLevel = 4
                break;

            case "normal":
                this.LogLevel = 3
                break;

            case "warn":
                this.LogLevel = 2
                break;

            case "none":
                this.LogLevel = 1
                break;

            default:
                this.LogLevel = 3

        }
    }

    if (this.config.debug != undefined) {
        if (this.config.debug = true) this.LogLevel = 4
    }

    if (this.LogLevel == 4) this.debug = true

    if (self.skipAllUnInit == undefined) self.skipAllUnInit = true;

    if (self.config.setupBodyAsCircuit == undefined) self.config.setupBodyAsCircuit = false
    if (self.config.IgnoreControllerReadyState == undefined) self.config.IgnoreControllerReadyState = false

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
        if (this.LogLevel >= 3) self.log('Starting UPnP search for PoolController.')

        client.on('response', function inResponse(headers, code, rinfo) {
            //console.log('Got a response to an m-search:\n%d\n%s\n%s', code, JSON.stringify(headers, null, '  '), JSON.stringify(rinfo, null, '  '))
            if (headers.ST === 'urn:schemas-upnp-org:device:PoolController:1') {
                self.config.ip_address = headers.LOCATION.replace('/device', '');
                if (this.LogLevel >= 3) self.log('Found nodejs-poolController at %s.', self.config.ip_address)
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
            if (this.LogLevel >= 2) self.log('Can not find nodejs-PoolController after %s seconds.', elapsedTime)
        }, 5000)

    } else {
        self.validateVersion(self.config.ip_address);
    }
}

PoolControllerPlatform.prototype.validateVersion = async function (URL) {
    var self = this;
    var valid = false
        , validMajor = 6
        , validMinor = 0
    var controllerNotReady = true
    var body

    body = await self.execute("device")

    var major = parseInt(body.match("<major>(.*)</major>")[1])
    var minor = parseInt(body.match("<minor>(.*)</minor>")[1])
    if (major > validMajor)
        valid = true
    else if (major === validMajor && minor >= validMinor)
        valid = true
    if (valid) {
        while (controllerNotReady) {
            if (this.LogLevel >= 4) self.log("Version checked OK, getting config data");

            data = await self.execute("getAll")
            if (self.config.IgnoreControllerReadyState) {
                if (this.LogLevel >= 3) self.log("Ignoring controller ready state. Controller state is: %s (%s)", data.status.name, data.status.val)
                controllerNotReady = false;

            }
            else {
                if (data.status.val == 1) {
                    if (this.LogLevel >= 3) self.log('Pool controller reports it is ready, getting initial data')
                    controllerNotReady = false;
                }
                else {
                    if (this.LogLevel >= 2) self.log('Pool controller not ready, retrying...')
                    await new Promise(resolve => setTimeout(resolve, 5000)); // wait 5 sec

                }
            }
        }

        self.InitialData(data);
    }
    else {
        if (this.LogLevel >= 2) self.log.error('Version of poolController %s.%s does not meet the minimum for this Homebridge plugin %s.%s', major, minor, validMajor, validMinor)
        process.exit()
    }
}

PoolControllerPlatform.prototype.InitialData = function (data) {
    var self = this;
    if (this.LogLevel >= 4) this.log("InitialData: ", data);
    var circuitData = data.circuits.concat(data.features)
    var addCircuit = true
    var bodyData = data.temps.bodies
    var pumpData = data.pumps
    var tempData = data.temps

    for (var i in circuitData) {
        addCircuit = true

        if (circuitData[i].name == "NOT USED") {
            addCircuit = false
        }

        if (circuitData[i].type.name.toLowerCase() == "spa" || circuitData[i].type.name.toLowerCase() == "pool") {
            if (this.config.setupBodyAsCircuit) {
                if (this.LogLevel >= 3)
                    this.log('setupBodyAsCircuit is true, setting up %s as circuit and NOT body accessory', circuitData[i].name)
            }
            else addCircuit = false

        }

        if (this.skipAllUnInit && circuitData[i].name.substr(0, 3) == "AUX") {
            addCircuit = false
        }

        if (this.skipAllUnInit && circuitData[i].name.substr(0, 7).toLowerCase() == "feature") {
            addCircuit = false
        }

        if (this.skipCircuitNames.includes(circuitData[i].name)) {
            addCircuit = false
        }

        var circuitNumber = circuitData[i].id;
        var circuitFunction = circuitData[i].type.name.toLowerCase();
        var circuitName = circuitData[i].name;
        var circuitState = circuitData[i].isOn;

        if (addCircuit == false)
            if (this.LogLevel >= 3) this.log('Skipping circuit/accessory %s', circuitName)
        if (addCircuit) {

            var id = "poolController." + circuitNumber + "." + circuitName; //added circuitName because circuit numbers will never change.  Changing the name will trigger a new UUID/device.

            var uuid = UUIDGen.generate(id);
            var cachedAccessory = this.accessories[uuid];

            // type === light
            if (['intellibrite', 'light', 'sam light', 'sal light', 'color wheel'].indexOf(circuitFunction) >= 0) {
                if (cachedAccessory === undefined) {
                    if (this.LogLevel >= 3) this.log('Creating new light accessory: circuitNumber: %s, id: %s', circuitNumber, id)
                    this.addLightAccessory(this.log, id, circuitName, circuitNumber, circuitState, this);
                } else {
                    if (this.LogLevel >= 3) this.log('Adding cached light accessory: circuitNumber: %s, id: %s', circuitNumber, id)
                    this.accessories[uuid] = new lightAccessory(this.log, cachedAccessory, circuitNumber, circuitState, Homebridge, this);
                }
            } else {
                if (cachedAccessory === undefined) {
                    if (this.LogLevel >= 3) this.log('Creating new circuit accessory: circuitNumber: %s, id: %s', circuitNumber, id)
                    this.addCircuitAccessory(this.log, id, circuitName, circuitNumber, circuitState, this);
                } else {
                    if (this.LogLevel >= 3) this.log('Using cached circuit accessory: circuitNumber: %s, id: %s', circuitNumber, id)
                    this.accessories[uuid] = new circuitAccessory(this.log, cachedAccessory, circuitNumber, circuitState, Homebridge, this);
                }
            }
        }
    }
    if (this.config.setupBodyAsCircuit == false) {
        for (var i in bodyData) {

            var bodyNumber = bodyData[i].circuit
            var bodyName = bodyData[i].name
            var bodyID = bodyData[i].id
            var id = "poolController." + bodyNumber + "." + bodyID + "." + bodyName; //added circuitName because circuit numbers will never change.  Changing the name will trigger a new UUID/device.
            var uuid = UUIDGen.generate(id);
            var cachedAccessory = this.accessories[uuid];
            if (this.LogLevel >= 4) this.log('Processing Body - ', id)
            if (this.LogLevel >= 4) this.log('Body UUID ', uuid)

            if (cachedAccessory === undefined) {
                if (this.LogLevel >= 3) this.log('Adding new body: %s', bodyName)
                this.addBodyAccessory(this.log, id, bodyName, bodyData[i], this);
            } else {
                if (this.LogLevel >= 3) this.log('Using cached body accessory: %s', bodyName)
                this.accessories[uuid] = new bodyAccessory(this.log, cachedAccessory, bodyData[i], Homebridge, this)
            }

        }
    }
    // add pumps
    for (var i in pumpData) {

        var pumpNumber = pumpData[i].id
        var pumpName = pumpData[i].type.desc
        var id = "poolController." + pumpNumber + "." + pumpName; //added circuitName because circuit numbers will never change.  Changing the name will trigger a new UUID/device.
        var uuid = UUIDGen.generate(id);
        var cachedAccessory = this.accessories[uuid];

        if (pumpData[i].type.hasAddress == true) {
            if (cachedAccessory === undefined) {
                if (this.LogLevel >= 3) this.log('Adding new pump accessory: %s', pumpName)

                this.addPumpAccessory(this.log, id, pumpName, pumpData[i], this);
            } else {
                if (this.LogLevel >= 3) this.log('Using cached pump accessory: %s', pumpName)

                this.accessories[uuid] = new pumpAccessory(this.log, cachedAccessory, pumpData[i], Homebridge, this)
            }
        }
    }

    // add Controller accessory
    var id = "poolController.0.Controller";
    var uuid = UUIDGen.generate(id);
    var cachedAccessory = this.accessories[uuid];
    controllerData = {}
    controllerData.delay = data.delay
    controllerData.mode = data.mode

    if (data.equipment.controllerType == "easytouch") {
        if (data.delay == undefined || data.mode == undefined) {
            if (this.LogLevel >= 3) this.log('Delay or mode not found, skipping controller accessory')
        }
        else {
            if (cachedAccessory === undefined) {
                if (this.LogLevel >= 3) this.log('Controller Delay and mode variables found, creating controller accessory: %s', data.equipment.model)
                this.addControllerAccessory(this.log, id, data.equipment.model, controllerData, this);
            }
            else {
                if (this.LogLevel >= 3) this.log('Controller Delay and mode variables found, using cached controller: %s', data.equipment.model)
                this.accessories[uuid] = new controllerAccessory(this.log, cachedAccessory, controllerData, Homebridge, this)
            }
        }
    }
    else {
        if (this.LogLevel >= 3) this.log('EasyTouch controller not found, skipping controller accessory')
    }

    // add temp accessories
    if (tempData.air !== undefined) {
        var id = "poolController.A.AirTemp";
        var uuid = UUIDGen.generate(id);
        var cachedAccessory = this.accessories[uuid];

        if (cachedAccessory === undefined) {
            if (this.LogLevel >= 3) this.log('Creating new temp sensor: Air Temperature')
            this.addTempAccessory(this.log, id, "Air Temperature", tempData.air, this);
        }
        else {
            if (this.LogLevel >= 3) this.log('Adding cached temp sensor: Air Temperature')
            this.accessories[uuid] = new tempAccessory(this.log, cachedAccessory, tempData.air, Homebridge, this)
        }
    }

    if (this.SupressWaterSensor) {
        if (this.LogLevel >= 3) this.log('Supress Water sensor option is set, skipping creation of water sensor accessory')

    }
    else {
        if (this.LogLevel >= 3) this.log('Supress Water sensor option set to False (or not set), attempting creation of water sensor accessory')

        if (tempData.waterSensor1 !== undefined) {
            var id = "poolController.B.WaterTemp";
            var uuid = UUIDGen.generate(id);
            var cachedAccessory = this.accessories[uuid];

            if (cachedAccessory === undefined) {
                if (this.LogLevel >= 3) this.log('Creating new temp sensor: Water Temperature')
                this.addTempAccessory(this.log, id, "Water Sensor", tempData.waterSensor1, this);
            }
            else {
                if (this.LogLevel >= 3) this.log('Adding cached sensor: Water Temperature')
                this.accessories[uuid] = new tempAccessory(this.log, cachedAccessory, tempData.waterSensor1, Homebridge, this)
            }
        }
    }
    //    socket = io(self.config.ip_address, {
    //        secure: self.config.secure,
    //        reconnect: true,
    //        rejectUnauthorized: false
    //    });
    if (this.LogLevel >= 4) this.log('Starting socket connection...')
    socket = io(self.config.ip_address);

    socket.on('connect', function () {
        if (this.LogLevel >= 3) self.log('homebridge-poolcontroller connected to the server')
        if (this.LogLevel >= 3) self.log("Socket connection status: ", socket.connected)

    })

    socket.on('connect_error', function () {
        if (this.LogLevel >= 2) self.log('ERROR: homebridge-poolcontroller can NOT find the pool controller')
    })
    socket.on('error', function (data) {
        if (this.LogLevel >= 2) console.log('Socket error:', data)
    });

    socket.on('circuit', this.socketCircuitUpdated.bind(this));
    socket.on('feature', this.socketCircuitUpdated.bind(this));
    if (this.config.setupBodyAsCircuit == false) socket.on('body', this.socketbodyUpdated.bind(this));
    socket.on('temps', this.socketTempsUpdated.bind(this));
    socket.on('controller', this.socketControllerUpdated.bind(this));
    socket.on('pump', this.socketPumpUpdated.bind(this));
};

PoolControllerPlatform.prototype.socketTempsUpdated = function (tempData) {
    if (this.LogLevel >= 4) this.log('FROM TEMP CLIENT: ' + JSON.stringify(tempData, null, "\t"));
    allbodyData = tempData.bodies

    if (this.config.setupBodyAsCircuit == false) {
        for (var i in allbodyData) {
            if (this.LogLevel >= 3) this.log('Updating temp (and all other) data for body: ', allbodyData[i].name)
            this.socketbodyUpdated(allbodyData[i])
        }
    }

    if (tempData.air !== undefined) {
        var id = "poolController.A.AirTemp";
        var uuid = UUIDGen.generate(id);
        var cachedAccessory = this.accessories[uuid];
        if (cachedAccessory !== undefined) {
            cachedAccessory.updateState(tempData.air)
        }
    }

    if (tempData.waterSensor1 !== undefined && !this.SupressWaterSensor) {
        var id = "poolController.B.WaterTemp";
        var uuid = UUIDGen.generate(id);
        var cachedAccessory = this.accessories[uuid];
        if (cachedAccessory !== undefined) {
            cachedAccessory.updateState(tempData.waterSensor1)
        }
    }

};


PoolControllerPlatform.prototype.socketControllerUpdated = function (controllerData) {
    if (this.LogLevel >= 4) this.log('FROM CONTROLLER CLIENT: ' + JSON.stringify(controllerData, null, "\t"));
    if (controllerData.delay !== undefined || controllerData.mode !== undefined) {

        var id = "poolController.0.Controller";
        var uuid = UUIDGen.generate(id);
        var cachedAccessory = this.accessories[uuid];
        if (cachedAccessory !== undefined) {
            cachedAccessory.updateState(controllerData)
        }
    }

};

PoolControllerPlatform.prototype.socketPumpUpdated = function (pumpData) {
    if (this.LogLevel >= 4) this.log('FROM PUMP CLIENT: ' + JSON.stringify(pumpData, null, "\t"));
    var pumpNumber = pumpData.id
    var pumpName = pumpData.type.desc
    var id = "poolController." + pumpNumber + "." + pumpName; //added circuitName because circuit numbers will never change.  Changing the name will trigger a new UUID/device.
    var uuid = UUIDGen.generate(id);
    var cachedAccessory = this.accessories[uuid];
    if (cachedAccessory !== undefined) {
        cachedAccessory.updateState(pumpData)
    }

};

PoolControllerPlatform.prototype.socketCircuitUpdated = function (circuitData) {
    if (this.LogLevel >= 4) this.log('FROM CIRCUIT CLIENT: ' + JSON.stringify(circuitData, null, "\t"));
    var circuitNumber = circuitData.id;
    var circuitFunction = circuitData.type.name.toLowerCase();
    var circuitName = circuitData.name;
    var circuitState = circuitData.isOn;
    var updateCircuit = true

    if (circuitName == "NOT USED") {
        updateCircuit = false
    }

    if ((this.config.setupBodyAsCircuit == false) && (circuitFunction == "spa" || circuitFunction == "pool")) {
        updateCircuit = false
    }

    if (this.skipAllUnInit && circuitName.substr(0, 3) == "AUX") {
        updateCircuit = false
    }

    if (this.skipAllUnInit && circuitName.substr(0, 7).toLowerCase() == "feature") {
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
    if (this.LogLevel >= 4) this.log('FROM BODY CLIENT: ' + JSON.stringify(bodyData, null, "\t"));
    var bodyNumber = bodyData.circuit
    var bodyName = bodyData.name
    var bodyID = bodyData.id
    var id = "poolController." + bodyNumber + "." + bodyID + "." + bodyName; //added circuitName because circuit numbers will never change.  Changing the name will trigger a new UUID/device.

    var uuid = UUIDGen.generate(id);
    var cachedAccessory = this.accessories[uuid];
    if (cachedAccessory !== undefined)
        cachedAccessory.updateState(bodyData)


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
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Pentair");
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.SerialNumber, uuid);

};

PoolControllerPlatform.prototype.addBodyAccessory = function (log, identifier, accessoryName, bodyData, platform) {
    var uuid = UUIDGen.generate(identifier);
    var accessory = new Accessory(accessoryName, uuid);
    accessory.addService(Service.Switch, accessoryName);
    accessory.addService(Service.Thermostat);


    this.accessories[uuid] = new bodyAccessory(log, accessory, bodyData, Homebridge, platform);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

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
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.SerialNumber, uuid);

};
PoolControllerPlatform.prototype.addTempAccessory = function (log, identifier, accessoryName, tempData, platform) {
    var customtypes = require('./customTypes.js')
    var CustomTypes = new customtypes(Homebridge)
    var uuid = UUIDGen.generate(identifier);
    var accessory = new Accessory(accessoryName, uuid);

    accessory.addService(Service.TemperatureSensor, accessoryName);

    this.accessories[uuid] = new tempAccessory(log, accessory, tempData, Homebridge, platform);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Pentair");
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.SerialNumber, uuid);

};

PoolControllerPlatform.prototype.addPumpAccessory = function (log, identifier, accessoryName, pumpData, platform) {
    var customtypes = require('./customTypes.js')
    var CustomTypes = new customtypes(Homebridge)
    var uuid = UUIDGen.generate(identifier);
    var accessory = new Accessory(accessoryName, uuid);

    accessory.addService(Service.Fan, accessoryName);

    accessory.getService(Service.Fan).addCharacteristic(Characteristic.RotationSpeed)
    accessory.getService(Service.Fan).addCharacteristic(CustomTypes.CurrentPowerConsumption)
    accessory.getService(Service.Fan).addCharacteristic(CustomTypes.TotalConsumption)
    accessory.getService(Service.Fan).addCharacteristic(CustomTypes.ResetTotal)
    accessory.getService(Service.Fan).addCharacteristic(CustomTypes.PumpGPM)
    accessory.getService(Service.Fan).addCharacteristic(CustomTypes.PumpRPM)

    accessory.getService(Service.Fan).getCharacteristic(Characteristic.On)
        .setProps({
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]

        })
    accessory.getService(Service.Fan).getCharacteristic(Characteristic.RotationSpeed)
        .setProps({
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]

        })

    this.accessories[uuid] = new pumpAccessory(log, accessory, pumpData, Homebridge, platform);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Pentair");
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.SerialNumber, uuid);

};


PoolControllerPlatform.prototype.addControllerAccessory = function (log, identifier, accessoryName, controllerData, platform) {
    var customtypes = require('./customTypes.js')
    var CustomTypes = new customtypes(Homebridge)

    var uuid = UUIDGen.generate(identifier);
    var accessory = new Accessory(accessoryName, uuid);
    accessory.addService(Service.ContactSensor, "Delay State")

    accessory.getService(Service.ContactSensor).addCharacteristic(CustomTypes.controllerMode)
    accessory.getService(Service.ContactSensor).addCharacteristic(CustomTypes.delayReason)

    this.accessories[uuid] = new controllerAccessory(log, accessory, controllerData, Homebridge, platform);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Pentair");
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.SerialNumber, uuid);

};

PoolControllerPlatform.prototype.addLightAccessory = function (log, identifier, accessoryName, circuit, power, platform) {
    var uuid = UUIDGen.generate(identifier);
    var accessory = new Accessory(accessoryName, uuid);
    accessory.addService(Service.Lightbulb, accessoryName);

    this.accessories[uuid] = new lightAccessory(log, accessory, circuit, power, Homebridge, platform);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Pentair");
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.SerialNumber, uuid);

};

PoolControllerPlatform.prototype.execute = async function (action, data) {
    const axios = require('axios').default;
    var poolURL = this.config.ip_address

    let opts = {
        method: 'put',
        data: data
    }
    switch (action) {
        case 'setCircuitState':
            opts.url = `${poolURL}/state/circuit/setState`
            break;
        case 'deleteCircuit':
            opts.url = `${poolURL}/config/circuit`
            opts.method = 'DELETE';
            break;
        case 'setCircuit':
            opts.url = `${poolURL}/config/circuit`
            break;
        case 'toggleCircuit':
            opts.url = `${poolURL}/state/circuit/toggleState`;
            break
        case 'setDateTime':
            opts['url'] = `${poolURL}/config/dateTime`;
            break;
        // HEAT MODES
        case 'setHeatMode':
            opts.url = `${poolURL}/state/body/heatMode`
            break;
        case 'setHeatSetPoint':
            opts.url = `${poolURL}/state/body/setPoint`
            break;
        case 'toggleHeatMode':
            opts.url = `${poolURL}/state/circuit/toggleState`
            break;
        // CHLORINATOR
        case 'chlorSearch':
            opts.method = 'get'
            opts.url = `${poolURL}/config/chlorinators/search`
            break;
        case 'setChlor':
            opts.url = `${poolURL}/state/chlorinator/setChlor`
            break;
        // APP OPTIONS
        case 'setAppLoggerOptions':
            opts.url = `${poolURL}/app/logger/setOptions`
            break;
        case 'startPacketCapture':
            opts.method = 'get'
            opts.url = `${poolURL}/app/config/startPacketCapture`
            break;
        case 'startPacketCaptureWithoutReset':
            opts.method = 'get'
            opts.url = `${poolURL}/app/config/startPacketCaptureWithoutReset`
            break;
        case 'stopPacketCapture':
            opts.method = 'get'
            opts.responseType = 'blob'
            opts.url = `${poolURL}/app/config/stopPacketCapture`
            break;
        // LIGHT GROUPS
        case 'setLightGroupTheme':
            opts.url = `${poolURL}/state/circuit/setTheme`
            break;
        case 'setLightGroupAttribs':
            opts.url = `${poolURL}/config/lightGroup`
            break;
        case 'configLightGroup':
            opts.url = `${poolURL}/config/lightGroup`
            break;
        // UTILITIES
        case "device":
            opts.method = 'get'
            opts.url = `${poolURL}/device`
            break;
        case "getAll":
            opts.method = 'get'
            opts.url = `${poolURL}/state/all`
            break;
        default:
            if (this.LogLevel >= 2) this.log(`missing API call ${action}`)
            return Promise.reject(`missing API call ${action}`)
    }
    try {
        if (this.LogLevel >= 4) this.log('Sending command to pool controller server: ', opts)
        let res = await axios(opts);
        return res.data;
    }
    catch (err) {
        if (this.LogLevel >= 2) this.log(`Error fetching data: ${err.message}`);
        return Promise.reject(err);
    }


};