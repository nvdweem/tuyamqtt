const debug = require('debug')('tuyamqqt:config');

import fs from 'fs';
import {ReplaySubject, Subject} from 'rxjs';
import {take} from 'rxjs/operators';

export interface IConfig {
    // tuya
    devices: IDevice[];
    port: number;

    // mqtt
    mqttHost: string;
    mqttTopic: string;

    // tuya-api
    apiKey: string;
    apiSecret: string;
    apiSchema: string;
    apiRegion: string;
    apiTimezone: string;
    apiTimeout: number;

    // Wifi
    wifiSsid: string;
    wifiPass: string;
}

export interface IDevice {
    id: string;
    key: string;
    name: string;
    domoticz?: number;
}

export interface IDeviceEvent {
    action: 'add' | 'remove' | 'change';
    device: IDevice;
}

export class Config {
    private confFile: string;
    console = new Subject<any>();
    options = new ReplaySubject<IConfig>(1);
    deviceEvents = new Subject<IDeviceEvent>();
    devices = new ReplaySubject<IDevice[]>(1);

    constructor(confLoc: string) {
        if (!confLoc.endsWith('/')) {
            confLoc += '/';
        }
        this.confFile = `${confLoc}config.json`;
        debug(`Using configuration from ${this.confFile}`);
        if (!fs.existsSync(this.confFile)) {
            fs.copyFileSync('config.default.json', this.confFile);
        }

        const config = this.readPromise(`${confLoc}config.json`);
        const def = this.readPromise('config.default.json');

        Promise.all([config, def]).then(([c, d]) => {
            const loaded = Object.assign(d, c);
            this.options.next(loaded);
            this.devices.next(loaded.devices || []);
        });
    }

    addDevice(device: IDevice): void {
        this.options.pipe(take(1)).subscribe(cfg => {
            if (!cfg.devices) {
                cfg.devices = [];
            }

            const idx = cfg.devices.findIndex(d => d.id === device.id);
            if (idx !== -1) {
                this.deviceEvents.next({
                    action: 'change',
                    device,
                });
                cfg.devices.splice(idx, 1);
            } else {
                this.deviceEvents.next({
                    action: 'add',
                    device,
                });
            }
            cfg.devices.push(device);
            this.devices.next(cfg.devices);
            this.saveInternal(cfg);
        });
    }

    deleteDevice(id: string): void {
        this.devices.pipe(take(1)).subscribe(ds => {
            const idx = ds.findIndex(d => d.id === id);
            if (idx !== -1) {
                const del = ds[idx];
                ds.splice(idx, 1);
                this.save();
                this.deviceEvents.next({
                    action: 'remove',
                    device: del,
                });
                this.devices.next(ds);
            }
        });
    }

    deviceChanged(device: IDevice): void {
        this.deviceEvents.next({
            action: 'change',
            device,
        });
    }

    save(): void {
        this.options.subscribe(cfg => this.saveInternal(cfg));
    }

    private readPromise(file: string): Promise<IConfig> {
        return new Promise(v => {
            fs.readFile(file, 'utf-8', (err, data) => {
                if (err) {
                    console.error('Unable to read configuration:', err);
                    process.exit(1);
                }
                v(JSON.parse(data));
            });
        });
    }

    private saveInternal(cfg: IConfig): void {
        fs.writeFile(this.confFile, JSON.stringify(cfg, undefined, 2), err => debug(err));
    }
}
