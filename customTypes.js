var homebridge;
var Characteristic;
var inherits = require("util").inherits;


module.exports = function(pHomebridge) {
    if (pHomebridge && !homebridge) {
      homebridge = pHomebridge;
      Characteristic = homebridge.hap.Characteristic;
    }

this.CurrentPowerConsumption = function () {
    Characteristic.call(this, 'Consumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52');
    this.setProps({
        format: Characteristic.Formats.UINT16,
        unit: "Watts",
        maxValue: 100000,
        minValue: 0,
        minStep: 1,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
    });
    this.value = this.getDefaultValue();
};
this.CurrentPowerConsumption.UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';
inherits(this.CurrentPowerConsumption, Characteristic);

this.TotalConsumption = function () {

    Characteristic.call(this, 'Energy', 'E863F10C-079E-48FF-8F27-9C2605A29F52');
		this.setProps({
			format: Characteristic.Formats.FLOAT,
			unit: "kWh",
			maxValue: 100000000000,
			minValue: 0,
			minStep: 0.001,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
		});
        this.value = this.getDefaultValue();
   
    };
    this.TotalConsumption.UUID =  'E863F10C-079E-48FF-8F27-9C2605A29F52';
    inherits(this.TotalConsumption, Characteristic);



this.ResetTotal = function () {
    Characteristic.call(this, 'Reset', 'E863F112-079E-48FF-8F27-9C2605A29F52');
		this.setProps({
			format: Characteristic.Formats.UINT32,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY, Characteristic.Perms.WRITE]
		});
        this.value = this.getDefaultValue();
	};
    this.ResetTotal.UUID =  'E863F112-079E-48FF-8F27-9C2605A29F52';
    inherits(this.ResetTotal, Characteristic);


this.PumpGPM = function () {
    Characteristic.call(this, 'Flow Rate', 'B935BEA0-4479-4FF7-9CD5-2E6CAD08C582');
        this.setProps({
            unit: "GPM",
            format: Characteristic.Formats.UINT16,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    this.PumpGPM.UUID =  'B935BEA0-4479-4FF7-9CD5-2E6CAD08C582';
    inherits(this.PumpGPM, Characteristic);


this.PumpRPM = function () {
    Characteristic.call(this, 'Pump RPM', '80F53933-FC27-4173-9DD9-5A0CA2D6E362');
        this.setProps({
            unit: "RPM",
            format: Characteristic.Formats.UINT16,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    this.PumpRPM.UUID =  '80F53933-FC27-4173-9DD9-5A0CA2D6E362';
    inherits(this.PumpRPM, Characteristic);

    this.controllerMode = function () {
        Characteristic.call(this, 'Controller Mode', '4DF47BFC-43F5-43E8-8CE5-B0C0C62C7485');
            this.setProps({
                format: Characteristic.Formats.string,
                perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
            });
            this.value = this.getDefaultValue();
        };
        this.controllerMode.UUID =  '4DF47BFC-43F5-43E8-8CE5-B0C0C62C7485';
        inherits(this.controllerMode, Characteristic);
    
        this.delayReason = function () {
            Characteristic.call(this, 'Delay Mode', '17F18B3F-4AB8-4470-B195-65A4C3203122');
                this.setProps({
                    format: Characteristic.Formats.string,
                    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
                });
                this.value = this.getDefaultValue();
            };
            this.delayReason.UUID =  '17F18B3F-4AB8-4470-B195-65A4C3203122';
            inherits(this.delayReason, Characteristic);
        
    
}
