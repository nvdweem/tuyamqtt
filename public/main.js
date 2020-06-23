(function () {
    const consoleArea = document.querySelector('textarea.console');
    const newDeviceBtn = document.querySelector('.new-device');
    const newDeviceStringBtn = document.querySelector('.new-device-string');
    const devicesTbl = document.querySelector('.devices');
    const activeCells = {};

    const url = location.href.replace(/^http/, 'ws');
    let ws;
    connect();

    function connect() {
        ws = new WebSocket(url);
        ws.onopen = () => {
            console.log('Connected to backend');
            writeConsole('Connected to back-end');
        };

        ws.onmessage = e => {
            const data = JSON.parse(e.data);
            switch (data.cmd) {
                case 'console': return writeConsole(data.data);
                case 'searchdone': return [writeConsole(data.data), newDeviceBtn.disabled = false];
                case 'devices': return writeTable(data.data);
                case 'connected': return setConnecteds(data.data);
            }
        };

        ws.onerror = e => {
            consoleArea.error('Error', e);
        };

        // Reconnect after connection is cloed
        ws.onclose = () => {
            setTimeout(() => connect(), 1000);
        };
    }

    function writeConsole(data) {
        if (typeof(data) !== 'string') {
            data = JSON.stringify(data);
        }
        consoleArea.value = (data + '\n' + consoleArea.value).trim();
    }

    function send(cmd, data) {
        if (!data) data = {};
        ws.send(JSON.stringify(Object.assign({}, data, {cmd})));
    }

    function writeTable(devices) {
        devicesTbl.innerHTML = '';
        for (const device of devices) {
            const row = devicesTbl.appendChild(document.createElement("TR"));
            const deleteCell = row.appendChild(document.createElement("TD"));
            const idCell = row.appendChild(document.createElement("TD"));
            const nameCell = row.appendChild(document.createElement("TD"));
            const domoCell = row.appendChild(document.createElement("TD"));
            const activeCell = row.appendChild(document.createElement("TD"));

            const nameField = nameCell.appendChild(document.createElement("INPUT"));
            const domoField = domoCell.appendChild(document.createElement("INPUT"));

            deleteCell.classList.add('cur-p');
            deleteCell.innerText = 'X';
            idCell.innerText = device.id;
            nameField.value = device.name;
            domoField.value = device.domoticz || '';

            if (typeof(activeCells[device.id]) === 'boolean') {
                activeCell.innerText = activeCells[device.id] ? 'V' : 'X';
            } else if (activeCells[device.id]) {
                activeCell.innerText = activeCells[device.id].innerText;
            }
            activeCells[device.id] = activeCell;

            nameField.addEventListener('change', () => send('updatedevice', {id: device.id, name: nameField.value}));
            domoField.addEventListener('change', () => send('updatedevice', {id: device.id, domoticz: domoField.value}));
            deleteCell.addEventListener('click', () => {
                if (confirm(`Are you sure you want to delete ${device.name}`)) {
                    send('deletedevice', {id: device.id});
                }
            });
        }
    }

    function setConnecteds(data) {
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                if (!activeCells[key] || typeof(activeCells[key]) === 'boolean') {
                    activeCells[key] = data[key];
                } else {
                    activeCells[key].innerText = data[key] ? 'V' : 'X';
                }
            }
        }
    }

    newDeviceBtn.addEventListener('click', () => {
        send('search', {});
        newDeviceBtn.disabled = true;
    });

    newDeviceStringBtn.addEventListener('click', () => {
        const str = prompt('Paste the device string in the box');
        if (str) {
            send('adddevice', {data: JSON.parse(str)});
        }
    });

    console.log('Starting', url);
})();
