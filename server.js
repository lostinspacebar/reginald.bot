var child_process = require('child_process');

function start() {
    var proc = child_process.spawn('node', ['index.js']);

    proc.stdout.on('data', function (data) {
        console.log(data.toString());
    });

    proc.stderr.on('data', function (data) {
        console.log(data.toString());
    });

    proc.on('exit', function (code) {
        console.log('Bot exited with code: ' + code);
        setTimeout(start, 1000);
    });
}

start();