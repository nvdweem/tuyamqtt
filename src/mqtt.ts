const debug = require('debug')('tuyamqqt:mqtt');
import {IConfig, IDevice} from './config';
import mqtt from 'mqtt';
import {MqttClient} from 'mqtt/types/lib/client';
import {BehaviorSubject, ReplaySubject} from 'rxjs';

interface ITopicHandler {
    device: IDevice;
    regexp: RegExp | string;
    handler: TopicHandlerFnc;
}

type TopicHandlerFnc = (data: any) => boolean;
export type DeviceCallback = (state: boolean) => void;

export class Mqtt {
    handledMessages = new ReplaySubject<string>(20);

    private client: MqttClient;
    private connected = new BehaviorSubject<boolean>(false);
    private topicHandlers: ITopicHandler[] = [];

    constructor(private cfg: IConfig) {
        this.client = mqtt.connect(cfg.mqttHost);
        this.client.on('connect', packet => this.connect(packet.cmd));
        this.client.on('error', error => console.error('MQTT error:', error.message));
        this.client.on('message', (topic, payload) => this.read(topic, payload));
    }

    publish(event: string, device: any): void {
        const data = {
            event,
            device: device.device.id,
            ip: device.device.ip,
        };
        this.client.publish(`${this.cfg.mqttTopic}/debug`, JSON.stringify(data));
        this.handledMessages.next(`MQTT > ${device.device.id} - ${JSON.stringify(data)}`);
    }

    publishData(device: any, data: any, domoticz?: number): void {
        const src = 'tuyamqtt';
        this.client.publish(`${this.cfg.mqttTopic}/${device.device.id}`, JSON.stringify({src, ...data}));
        this.client.publish(`${this.cfg.mqttTopic}/out`, JSON.stringify({src, device: device.device.id, data}));

        if (domoticz && data.hasOwnProperty('1')) {
            this.client.publish('domoticz/in', JSON.stringify({idx: domoticz, nvalue: data[1] ? 1 : 0}));
        }

        this.handledMessages.next(`MQTT > ${device.device.id} - ${JSON.stringify(data)}`);
    }

    follow(dev: IDevice, cb: DeviceCallback): void {
        if (dev.domoticz) {
            this.client.subscribe('domoticz/out');
            this.topicHandlers.push({
                device: dev,
                regexp: 'domoticz/out',
                handler: this.domoOutHandler(dev.domoticz, cb),
            });
        }

        this.client.subscribe(`${this.cfg.mqttTopic}/${dev.id}`);
        this.topicHandlers.push({
            device: dev,
            regexp: `${this.cfg.mqttTopic}/${dev.id}`,
            handler: data => {
                if (!data.hasOwnProperty('1')) {
                    return false;
                }
                cb(!!data['1']);
                return true;
            },
        });

        this.client.subscribe(`${this.cfg.mqttTopic}/out`);
        this.topicHandlers.push({
            device: dev,
            regexp: `${this.cfg.mqttTopic}/out`,
            handler: msg => {
                if (msg.device !== dev.id) {
                    return false;
                }
                const data = msg.data;
                if (!data.hasOwnProperty('1')) {
                    return false;
                }
                cb(!!data['1']);
                return true;
            },
        });
    }

    stopFollowing(dev: IDevice): void {
        this.client.unsubscribe(`${this.cfg.mqttTopic}/${dev.id}`);
        this.topicHandlers = this.topicHandlers.filter(th => th.device.id !== dev.id);
    }

    private domoOutHandler(idx: number, cb: DeviceCallback): TopicHandlerFnc {
        return data => {
            if (data.idx === idx) {
                cb(data.nvalue === 1);
                return true;
            }
            return false;
        };
    }

    private connect(cmd: string): void {
        const connect = cmd === 'connack';
        this.connected.next(connect);
        if (!connect) {
            console.log('MQTT connection disconnected', cmd);
        }
    }

    private read(topic: string, payload: Buffer): void {
        let data: any = payload.toString();
        try {
            data = JSON.parse(data);
            debug('MQTT message:', topic, data);

            if (data.src === 'tuyamqtt') {
                debug('Message came from tuyamqtt, ignoring');
                return;
            }
        } catch (e) {
            console.log('Data read that is not json, unable to proceed:', data);
            return;
        }

        for (const th of this.topicHandlers) {
            const strMatch = typeof (th.regexp) === 'string' && topic === th.regexp;
            const reMatch = typeof (th.regexp) !== 'string' && th.regexp.test(topic);
            if ((strMatch || reMatch) && th.handler(data)) {
                this.handledMessages.next(`MQTT < ${topic} - ${payload.toString()}`);
                return;
            }
        }
    }
}
