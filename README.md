# tuyamqtt
Interface between Tuya devices and a MQTT broker.

Build on top of the [Tuyapi](https://github.com/codetheweb/tuyapi) project and offers some ease-of-use when combined with [Domoticz](https://www.domoticz.com/).

I only have Tuya power plugs, so it currently supports those and probably not much else.

## How to use
Checkout the source code, run `npm ci` and then `npm start` and close again when the app is running. Edit the `config.json` file and add the required information and run again with `npm start`.

The `api` and `wifi` prefixed options are only needed when using this tool to pair with tuya devices. The devices array can also be populated manually in the following format:

```javascript
{
  "devices": [
    {
      "id": "deviceid",
      "key": "devicekey",
      "name": "devicename",
      "domoticz": 123 // (optional)
    }
  ]
}
```

Tuyapi has a description on how to get the `api` prefixed settings [here](https://github.com/codetheweb/tuyapi/blob/master/docs/SETUP.md).

## Note
Only 1 application can use devices at the same time. If this application is running it isn't possible to control the devices with the Android/iOS apps.
