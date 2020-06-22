import {Subject} from 'rxjs';

const debug = require('debug')('tuyamqqt:tuya');

import {Mqtt} from './mqtt';
import {Config, IConfig, IDevice} from './config';

const TuyAPI = require('tuyapi');
const TuyaLink = require('@tuyapi/link').wizard;
const API = require('@tuyapi/openapi');

export interface ILinkResult {
    success: boolean;
    message?: string;
    device?: IDevice;
}

export class Tuya {
    private devices = new Map<string, any>();
    private tuya: any;
    connected: {[key: string]: boolean} = {};
    connectedChanged = new Subject<[string, boolean]>();

    constructor(private cfg: IConfig,
                config: Config,
                private mqtt: Mqtt) {
        config.deviceEvents.subscribe(de => {
            switch (de.action) {
                case 'add':
                    return this.addDevice(de.device);
                case 'remove':
                    return this.removeDevice(de.device);
                case 'change':
                    this.removeDevice(de.device);
                    this.addDevice(de.device);
                    return;
                default:
                    console.error('Unknown event type:', de);
            }
        });

        this.connectedChanged.subscribe(([id, connected]) => {
            this.connected[id] = connected;
        });
    }

    async findDevice(): Promise<ILinkResult> {
        const link = new TuyaLink({
            apiKey: this.cfg.apiKey,
            apiSecret: this.cfg.apiSecret,
            email: 'johndoe@example.com',
            password: 'examplepassword',
            schema: this.cfg.apiSchema,
            region: this.cfg.apiRegion,
            timezone: this.cfg.apiTimezone,
        });

        await link.init();
        const devices = await link.linkDevice({timeout: this.cfg.apiTimeout, ssid: this.cfg.wifiSsid, wifiPassword: this.cfg.wifiPass, devices: 1});

        const api = new API({key: this.cfg.apiKey, secret: this.cfg.apiSecret, schema: this.cfg.apiSchema, region: this.cfg.apiRegion});
        await api.getToken();
        const deviceDetails = (await api.getDevices({ids: devices.map((d: any) => d.id)})).devices;

        if (deviceDetails.length === 1) {
            return {
                success: true,
                device: {
                    id: deviceDetails[0].id,
                    key: deviceDetails[0].local_key,
                    name: deviceDetails[0].name,
                },
            };
        } else {
            return {
                success: false,
                message: 'No device linked',
            };
        }
    }

    addDevice(dev: IDevice, timeout: number = 1): void {
        const device = new TuyAPI(dev);
        if (timeout !== 1) {
            console.log('Trying to reconnect to', dev.name);
        }

        device.find().then(() => {
            // Connect to device
            this.devices.set(dev.id, device);
            this.mqtt.publish('FoundDevice', device);
            device.connect();
            timeout = 1;
        }).catch(() => {
            this.reconnect(dev, timeout);
        });

        device.on('connected', () => {
            this.mqtt.publish('Connected', device);
            this.connectedChanged.next([device.device.id, true]);
            console.log('Connected:', dev.name, device.device.ip);
        });

        device.on('disconnected', () => {
            this.mqtt.publish('Disconnected', device);
            this.connectedChanged.next([device.device.id, false]);
            console.log('Disconnected:', dev.name, device.device.ip);

            this.reconnect(dev, timeout);
        });

        device.on('error', (error: any) => {
            this.mqtt.publish('Error', device);
            debug('Error!', device.device.ip, error);
        });

        device.on('data', (data: any) => {
            if (typeof (data) === 'string') {
                device.disconnect();
                console.error(`Device ${dev.id} has an invalid key ${dev.key} which means it's not possible to see and read status`);
                return;
            }

            this.mqtt.publishData(device, data.dps, dev.domoticz);
            debug('Data from device:', data.dps);
        });

        this.mqtt.follow(dev, state => {
            console.log('State was changed to', state);
            device.set({set: state});
        });

        this.tuya = device;
    }

    removeDevice(dev: IDevice): void {
        const device = this.devices.get(dev.id);
        if (!device) {
            return;
        }

        device.disconnect();
        this.devices.delete(dev.id);
        this.mqtt.stopFollowing(dev);
    }

    private reconnect(dev: IDevice, timeout: number): void {
        const newTimeout = Math.min(timeout * 2, 300);
        debug(`Reconnecting in ${newTimeout} seconds`);
        setTimeout(() => this.addDevice(dev, newTimeout), timeout * 1000);
    }
}
