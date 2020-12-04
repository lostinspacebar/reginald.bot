/**
 * 
 * FEATURE LIST:
 * - Horse Racing with TTS
 * - Sopranos
 * - Chess
 */

const Discord = require("discord.js");
const config = require("./config.json");
const gTTS = require('gtts');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const websocket = require('ws');
const { exec } = require("child_process");

require('log-timestamp');

const prefix = "~";
var client = undefined;

const TTS_LANGUAGES = {
    'af': 'Afrikaans',
    'sq': 'Albanian',
    'ar': 'Arabic',
    'hy': 'Armenian',
    'ca': 'Catalan',
    'zh': 'Chinese',
    'zh-cn': 'Chinese (Mandarin/China)',
    'zh-tw': 'Chinese (Mandarin/Taiwan)',
    'zh-yue': 'Chinese (Cantonese)',
    'hr': 'Croatian',
    'cs': 'Czech',
    'da': 'Danish',
    'nl': 'Dutch',
    'en': 'English',
    'en-au': 'English (Australia)',
    'en-uk': 'English (United Kingdom)',
    'en-us': 'English (United States)',
    'eo': 'Esperanto',
    'fi': 'Finnish',
    'fr': 'French',
    'de': 'German',
    'el': 'Greek',
    'ht': 'Haitian Creole',
    'hi': 'Hindi',
    'hu': 'Hungarian',
    'is': 'Icelandic',
    'id': 'Indonesian',
    'it': 'Italian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'la': 'Latin',
    'lv': 'Latvian',
    'mk': 'Macedonian',
    'no': 'Norwegian',
    'pl': 'Polish',
    'pt': 'Portuguese',
    'pt-br': 'Portuguese (Brazil)',
    'ro': 'Romanian',
    'ru': 'Russian',
    'sr': 'Serbian',
    'sk': 'Slovak',
    'es': 'Spanish',
    'es-es': 'Spanish (Spain)',
    'es-us': 'Spanish (United States)',
    'sw': 'Swahili',
    'sv': 'Swedish',
    'ta': 'Tamil',
    'th': 'Thai',
    'tr': 'Turkish',
    'vi': 'Vietnamese',
    'cy': 'Welsh'
}

var isBusy = false;
var isConnected = false;
var isBeta = false;

process.on('unhandledRejection', function(err) {
    console.log(err);
});

async function handleVoiceCommand(voiceChannel, voiceCommand) {
    if(isBusy) {
        return;
    }
    if(voiceCommand.includes("sing me a song")) {
        console.log('singing song');
        var files = [];
        var entries = fs.readdirSync(`./songs`, { withFileTypes: true });
        for(var entry of entries) {
            if(entry.isFile()) {
                files.push(`./songs/${entry.name}`);
            }
        }
        
        if(files.length > 0) {
            var fileToPlay = files[Math.floor(Math.random() * files.length)];
            exec(`text2wave -mode singing -o song.wav ${fileToPlay}`, (error, stdout, stderr) => {
                console.log('Generated song file.');
                if(error) {
                    console.log(error);
                } else {
                    sayTTS(voiceChannel, 'here goes nothing')
                        .then(async () => {
                            console.log('here');
                            playAudio(voiceChannel, './song.wav')
                                .then(() => sayTTS(voiceChannel, 'thank you'))
                                .catch(error => console.error(error));
                        })
                        .catch(error => {
                            console.log(error);
                        })
                }
            });
        }
    }
}

function convertSpeechToWav(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
        .inputOptions(['-f s16le', '-ar 48k', '-ac 2'])
        .output(outputFile)
        .outputOptions(['-filter:a loudnorm', '-ar 8k', '-ac 1'])
        .on('end', function() {
            resolve(outputFile);
        })
        .on('error', err => {
            reject(err);
        })
        .run();
    });
}

function speechToText(inputFile) {
    return new Promise((resolve, reject) => {
        var results = [];
        vosk_ws = new websocket('ws://vosk:2700');
        vosk_ws.on('open', function open() {
            var readStream = fs.createReadStream(inputFile);
            readStream.on('data', function (chunk) {
                vosk_ws.send(chunk);
            });
            readStream.on('end', function () {
                vosk_ws.send('{"eof" : 1}');
            });
        });
        vosk_ws.on('message', function incoming(data) {
            results.push(JSON.parse(data));
        });
        vosk_ws.on('error', error => reject(error));
        vosk_ws.on('close', () => resolve(results));
    });
}

/**
 * Joins the specified voice channel if not already in it.
 */
async function joinChannel(voiceChannel) {
    var connection = client.voice.connections.find(conn => conn.channel.id == voiceChannel.id);
    if(connection == undefined) {
        connection = await voiceChannel.join();
        connection.on('error', error => {
            if(isConnected) {
                isConnected = false;
                console.log("Voice channel disconnected.");
                connect();
            }
        });
        connection.on('speaking', async(user, speaking) => {
            if (speaking.bitfield == 0) {
                return;
            }
            if (isBeta == false) {
                return;
            }
    
            var recordFile = `record/voice-${Date.now()}.raw`;
            var waveFile = recordFile + '.wav';
            let ws = fs.createWriteStream(recordFile);
            const audioStream = connection.receiver.createStream(user, { mode: 'pcm'});
            audioStream.pipe(ws);
            audioStream.on('error', e => console.error(e));
            audioStream.on('end', () => {
                console.log('finished speaking');
                convertSpeechToWav(recordFile, waveFile)
                    .then(waveFile => {
                        speechToText(waveFile)
                            .then(results => {
                                for(var result of results) {
                                    if(result.text != undefined) {
                                        var speechText = result.text.trim();
                                        if(speechText.startsWith('hey reginald')) {
                                            handleVoiceCommand(voiceChannel, speechText);
                                        }
                                    }
                                }
                                fs.unlinkSync(recordFile);
                                fs.unlinkSync(waveFile);
                            })
                            .catch(err => {
                                console.log("Transcribe failed.");
                                console.log(err);
                            })
                    })
                    .catch(err => {
                        console.log("File conversion failed.");
                        console.log(err);
                    });
                
            });
        });
    }
    return connection;
}

/**
 * Plays the specified audio file over the discord voice channel. Connects to voice channel if needed.
 * 
 * @param {VoiceChannel} voiceChannel 
 * @param {string} file 
 */
function playAudio(voiceChannel, file) {
    return new Promise((resolve, reject) => {
        joinChannel(voiceChannel)
            .then(connection => {
                if(!isConnected) {
                    return;
                }
                const dispatcher = connection.play(file);
                dispatcher.on("finish", end => {
                    isBusy = false;
                    resolve();
                });
            })
            .catch(error => {
                console.error(`Error joining voice channel ${voiceChannel.name}.`);
                console.error(error);
                reject();
            });
    });
}

function sayTTS(voiceChannel, text, language = 'en') {
    return new Promise((resolve, reject) => {
        isBusy = true;
        var fileToPlay = undefined;
        if(language == 'en') {
            text = text.replace(/'/g, "\\'");
            text = text.replace(/"/g, `\\"`);
            exec(`echo ${text} | text2wave -o tts.wav`, (error, stdout, stderr) => {
                if(error) {
                    console.log(error);
                }
                fileToPlay = './tts.wav';
                playAudio(voiceChannel, fileToPlay)
                    .then(() => resolve())
                    .catch(error => reject(error));
            });
        } else {
            var gtts = new gTTS(text, language);
            gtts.save('./tts.mp3', function (error, result) { 
                if(error) { 
                    console.log(error);
                }
                fileToPlay = './tts.mp3';
            });
        }
    });
}

function handleTTS(message, command, subCommand, args, messageText) {
    if(isBusy) {
        return message.reply("I'm busy.");
    }
    if(!message.member.voice.channel)
    {
        return message.reply("You have to be in a voice channel.");
    }
    if(messageText.trim() == '')
    {
        return message.reply("Usage: ~tts some text here.");
    }
    if(subCommand == '') {
        subCommand = 'say';
    }

    if(subCommand == 'say') {
        var language = 'en';
        if(args.length > 0) {
            var languageArg = args[0].trim();
            if(languageArg in TTS_LANGUAGES) {
                language = languageArg;
            }
        }
        sayTTS(message.member.voice.channel, messageText.trim(), language);
    }
    else if(subCommand == 'help') {
        var languageList = "";
        for(var languageCode in TTS_LANGUAGES) {
            languageList += languageCode + ": " + TTS_LANGUAGES[languageCode] + "\r\n";
        }
        const helpEmbed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Reginald.Bot TTS Help')
            .setDescription('Speaks text into the voice channel you are in. Default language / accent is US English.')
            .addFields(
                { name: 'Usage', value: '~tts [optional-language-code] text to speak'},
                { name: 'Help', value: '~tts !help' },
                { name: 'TTS Languages', value: languageList }
            );
        message.channel.send(helpEmbed);
    }
}

/**
 * Given a soundboard name and the category, returns a file to be played.
 * @param {*} soundboard 
 * @param {*} category 
 */
function getSoundboardFile(soundboard, category) {
    // Figure out categories
    var categories = [];
    var dirEntries = fs.readdirSync(`./${soundboard}`, { withFileTypes: true });
    for(var dirEnt of dirEntries) {
        if(dirEnt.isDirectory()) {
            categories.push(dirEnt.name);
        }
    }
    
    // Specific category or all categories.
    var categoriesToInclude = [];
    if(categories.indexOf(category) >= 0) {
        categoriesToInclude.push(category);
    } else {
        categoriesToInclude = categories;
    }

    // Find candidate files.
    var files = [];
    for(var cat of categoriesToInclude) {
        var entries = fs.readdirSync(`./${soundboard}/${cat}`, { withFileTypes: true });
        for(var entry of entries) {
            if(entry.isFile()) {
                files.push(`${cat}/${entry.name}`);
            }
        }
    }
    
    if(files.length > 0) {
        var fileToPlay = files[Math.floor(Math.random() * files.length)];
        return `./${soundboard}/${fileToPlay}`;
    }

    return undefined;
}

function handleRoll(message, command, subCommand, args, messageText) {
    if(messageText.trim() == '') {
        messageText = '6';
    }
    var rollSideString = messageText.trim();
    if(!isNaN(Number(rollSideString))) {
        numSides = parseInt(Number(rollSideString));
        message.channel.send("Rolled a " + numSides + " sided die and got " + Math.floor((Math.random() * numSides) + 1));
    }
    else {
        message.reply("That's not a number.");
    }
}

function handleSoprano(message, command, subCommand, args, messageText) {
    if(!message.member.voice.channel)
    {
        return message.reply("You have to be in a voice channel.");
    }
    var fileToPlay = getSoundboardFile('sop');
    if(fileToPlay != undefined) {
        playAudio(message.member.voice.channel, fileToPlay);
    }
}

function handleSara(message, command, subCommand, args, messageText) {
    if(!message.member.voice.channel)
    {
        return message.reply("You have to be in a voice channel.");
    }
    var fileToPlay = getSoundboardFile('sara');
    if(fileToPlay != undefined) {
        playAudio(message.member.voice.channel, fileToPlay);
    }
}

function handleClientMessage(message) {
    // Ignore all bots
    if(message.author.bot) { 
        return;
    }

    // Only respond to messages with the bot prefix
    if(!message.content.startsWith(prefix)) {
        return;
    }

    // Parse out command info
    const commandBody = message.content.slice(prefix.length);
    const tokens = commandBody.split(' ');
    const command = tokens.shift().toLowerCase();
    var subCommand = '';
    var args = [];

    // See if any subcommand was provided. This has to follow the main command
    if(tokens.length > 0 && tokens[0].startsWith('!')) {
        subCommand = tokens.shift().substring(1).trim();
    }

    var messageText = tokens.join(' ');

    // See if any arguments were provided. They have to be provided right 
    // after any subcommands.
    if(tokens.length > 0 && tokens[0].startsWith('[')) {
        var restOfMessageBody = tokens.join(' ');
        var endOfArgs = restOfMessageBody.indexOf(']');
        if(endOfArgs != -1) {
            args = restOfMessageBody.substring(1, endOfArgs).split(',');
            messageText = restOfMessageBody.substring(endOfArgs + 1);
        }
    }

    // Handle commands
    if(command == "tts") {
        handleTTS(message, command, subCommand, args, messageText);
    }
    else if(command == "roll") {
        handleRoll(message, command, subCommand, args, messageText);
    }
    else if(command == "sop" || command == "soprano") {
        handleSoprano(message, command, subCommand, args, messageText);
    }
    else if(command == "sara" || command == "jamie") {
        handleSara(message, command, subCommand, args, messageText);
    }
    else if(command == "beta") {
        //isBeta = ~isBeta;
    }
}

function handleClientError(error) {
    isConnected = false;
    client.destroy();
    console.error("Connection error. Going to try again in 2 seconds...");
    setTimeout(connect, 2000);
}

function connect() {
    console.log("Attempting to connect...");
    if(client != undefined) {
        client.destroy();
    }
    client = new Discord.Client();
    client.on("message", handleClientMessage);
    client.on("ready", () => {
        console.log("Client connected.");
        isConnected = true;
    });
    client.login(config.BOT_TOKEN).catch(error => {
        console.error("Could not login.");
        handleClientError(error);
    });
}

connect();