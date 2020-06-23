const debug = require('debug')('tuyamqqt:main');

import {Express} from './express';
import {Config} from './config';
import {Mqtt} from './mqtt';
import {Tuya} from './tuya';

console.log('Starting');
const config = new Config(process.env.config || './');
config.options.subscribe(cfg => {
    const mqtt = new Mqtt(cfg);
    const tuya = new Tuya(cfg, config, mqtt);
    const express = new Express(cfg, config, mqtt, tuya);

    console.log('Connecting to devices');
    (cfg.devices || []).forEach(d => tuya.addDevice(d));

    console.log(`Started and listening on port ${cfg.port}`);
});
