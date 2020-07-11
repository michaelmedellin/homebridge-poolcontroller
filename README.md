# homebridge-poolcontroller for [next branch](https://github.com/tagyoureit/nodejs-poolController/tree/next)

PoolController plugin for homebridge: https://github.com/nfarina/homebridge


##This plugin is forked from the original plugin published by @leftyfl1p at https://github.com/leftyfl1p/homebridge-poolcontroller

Key Changes
1. Compatible with the new API in `next` branch of `nodejs-poolController`
2. Support for displaying history (e.g temps, pump power consumption, etc) in the [EVE](https://apps.apple.com/us/app/eve-for-homekit/id917695792) app 
3. Support for setting configuration options in the homebridge UI
4. Ability to skip circuits (auxiliary and feature circuits) that are not used on the outdoor panel (either in bulk or by specific circuit names - thanks [@emes](https://github.com/gadget-monk/homebridge-poolcontroller/pull/1))

Requires PoolController (next branch): https://github.com/tagyoureit/nodejs-poolController

Config options and explanation:

`ip_address`: Set to "*" to use SSDP auto-discovery or specify full path to nodejs-poolController (e.g. `http://ip_address:4200`)
`secure`: Use secure connection to server
`skipAllUnInit`: If `true`, plugin will skip any uninitialized circuit (names starting with "AUX" or "Feature")
`skipCircuitNames`: List of circuits to skip (specify circuit names) 
`debug`: Enable pluging debug reporting (in Homebridge log) 