import express from 'express';
import {Config, IConfig} from './config';
import {Mqtt} from './mqtt';
import {Tuya} from './tuya';
import {WsSession} from './wssession';

const Ws = require('ws');

export class Express {
    private sessions: WsSession[] = [];
    constructor(private cfg: IConfig, private config: Config, private mqtt: Mqtt, private tuya: Tuya) {
        const app = express();

        const server = require('http').createServer(app);
        app.use(express.static('public'));

        const ws = new Ws.Server({server});
        ws.on('connection', (sess: any) => {
            this.sessions.push(new WsSession(sess, config, mqtt, tuya));
        });

        server.listen(cfg.port);
        console.log();
    }
}
