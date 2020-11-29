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

process.on('unhandledRejection', function(err) {
    console.log(err);
});

function playAudioHelper(connection, file) {
    if(!isConnected) {
        return;
    }
    const dispatcher = connection.play(file);
    connection.on('error', error => {
        if(isConnected) {
            isConnected = false;
            console.log("Voice channel disconnected.");
            connect();
        }
    })
    dispatcher.on("finish", end => {
        isBusy = false;
    });
}

function playAudio(voiceChannel, file) {
    var connection = client.voice.connections.find(conn => conn.channel.id == voiceChannel.id);
    if(connection != undefined) {
        playAudioHelper(connection, file);
    }
    else {
        voiceChannel.join().then(connection => playAudioHelper(connection, file)).catch(err => console.log(err));
    }
}

function handleTTS(message, command, subCommand, args, messageText) {
    if(isBusy) {
        return message.reply("I'm busy.");
    }
    if(!message.member.voice.channel)
    {
        return message.reply("You have to be in a voice channel.");
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

        isBusy = true;
        var gtts = new gTTS(messageText.trim(), language);
        gtts.save('./tts.mp3', function (err, result) { 
            if(err) { 
                throw new Error(err); 
            }
            playAudio(message.member.voice.channel, './tts.mp3');
        });
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
    var files = fs.readdirSync('./sop/');
    var fileToPlay = files[Math.floor(Math.random() * files.length)];
    playAudio(message.member.voice.channel, './sop/' + fileToPlay);
}

function handleSara(message, command, subCommand, args, messageText) {
    if(!message.member.voice.channel)
    {
        return message.reply("You have to be in a voice channel.");
    }
    var files = fs.readdirSync('./sara/');
    var fileToPlay = files[Math.floor(Math.random() * files.length)];
    playAudio(message.member.voice.channel, './sara/' + fileToPlay);
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