import {take} from 'rxjs/operators';

const debug = require('debug')('tuyamqqt:session');
import {Mqtt} from './mqtt';
import {ILinkResult, Tuya} from './tuya';
import {Subscription} from 'rxjs';
import {Config, IDevice} from './config';

export class WsSession {
    private subscriptions: Subscription[] = [];

    constructor(private sess: any, private cfg: Config, private mqtt: Mqtt, private tuya: Tuya) {
        sess.onmessage = (e: any) => {
            this.onCommand(JSON.parse(e.data));
        };
        sess.onclose = (e: any) => {
            debug(e);
            this.close();
        };

        this.subscriptions.push(this.mqtt.handledMessages.subscribe(v => this.send({cmd: 'console', data: v})));
        this.subscriptions.push(cfg.devices.subscribe(ds => this.send({cmd: 'devices', data: ds})));
        this.subscriptions.push(tuya.connectedChanged.subscribe(([id, connected]) => {
            const data: any = {};
            data[id] = connected;
            this.send({cmd: 'connected', data});
        }));
        this.subscriptions.push(cfg.console.subscribe(s => this.send(s)));
        this.send({cmd: 'connected', data: this.tuya.connected});
    }

    close(): void {
        this.subscriptions.forEach(s => s.unsubscribe());
        this.sess.close();
    }

    send(data: any): void {
        if (typeof (data) === 'string') {
            data = {cmd: 'console', data};
        }
        this.sess.send(JSON.stringify(data));
    }

    private onCommand(data: ICommand): void {
        switch (data.cmd) {
            // case 'init': return this.init(sess);
            case 'search':
                return this.search();
            case 'updatedevice':
                return this.updateDevice(data);
            case 'deletedevice':
                return this.deleteDevice(data.id);
            case 'adddevice':
                return this.addDevice(data.data);
        }
    }

    private search(): void {
        this.tuya.findDevice().then(d => {
            if (d.success && d.device) {
                this.cfg.addDevice(d.device);
                this.cfg.console.next({cmd: 'console', data: {msg: 'Device added', device: d.device}});
            }
            debug(d);
            return d;
        }).then(d => this.send({cmd: 'searchdone', data: `Device ${d.device?.name} added`}))
            .catch(e => {
                this.send({cmd: 'searchdone', data: {success: false, message: e.message} as ILinkResult});
                console.error(e);
            });
    }

    private addDevice(data: IDevice): void {
        if (data.hasOwnProperty('id') && data.hasOwnProperty('key')) {
            this.cfg.addDevice(data);
            this.cfg.console.next({cmd: 'console', data: {msg: 'Device added', device: data}});
        }
    }

    private updateDevice(data: IUpdateDeviceCommand): void {
        this.cfg.devices.pipe(take(1)).subscribe(devices => {
            const target = devices.find(d => d.id === data.id);
            if (!target) {
                return;
            }

            if (data.name) {
                target.name = data.name;
            }
            if (data.domoticz) {
                target.domoticz = +data.domoticz;
                this.cfg.deviceChanged(target);
            }
            debug('Changed', target);
            this.cfg.save();
        });
    }

    private deleteDevice(id: string): void {
        this.cfg.deleteDevice(id);
    }
}

type ICommand = ISearchCommand | IUpdateDeviceCommand | IDeleteDeviceCommand | IAddDeviceCommand;

interface ISearchCommand {
    cmd: 'search';
}

interface IUpdateDeviceCommand {
    cmd: 'updatedevice';
    id: string;
    name?: string;
    domoticz?: string;
}

interface IDeleteDeviceCommand {
    cmd: 'deletedevice';
    id: string;
}

interface IAddDeviceCommand {
    cmd: 'adddevice';
    data: IDevice;
}
