const fs = require('fs');
const requests = require("request");
var text2png = require('text2png');
var Jimp = require('jimp');
var exec = require('child_process').exec;
const { getAudioDurationInSeconds } = require('get-audio-duration');

const stream = require('stream');

const TextToSpeechV1 = require("ibm-watson/text-to-speech/v1");

//remove swearing
var Filter = require('bad-words');
var customFilter = new Filter({ placeHolder: '+-~12'});

let config = JSON.parse(fs.readFileSync('config.json'));

const textToSpeech = new TextToSpeechV1({
    iam_apikey: config.apiKey,
    url: 'https://gateway-wdc.watsonplatform.net/text-to-speech/api'
});

var imagesProcessed = 0;
var soundProcessed = 0;
var totalItems = -1;
//all voice lengths
var audioStreamLengths = [];

requests.get('https://www.reddit.com/r/askreddit/top.json?t=all', {}, function(err, res, body) {
    body = JSON.parse(body);

    let posts = body.data.children;

    for (let i = 0; i < posts.length; i++) {
        //remove mod posts
        if (posts[i].data.distinguished == "moderator") {
            //delete this one
            posts.splice(i, 1);
            //try at this index again
            i--;
        }
    }

    let randomPostIndex = Math.floor(Math.random() * body.data.children.length);

    let cleanText = getCleanText(posts[randomPostIndex].data.title);
    let displayText = getDisplayText(cleanText, posts[randomPostIndex].data);

    saveImage('processed/title.png', displayText);

    saveSpeech('processed/title.wav', cleanText)

    getComments(posts[randomPostIndex]);
});

function getComments(post) {
    let url = post.data.url;

    requests.get(url.substring(0, url.length - 2) + ".json", {}, function(err, res, body) {
        let response = JSON.parse(body);

        let comments = response[1].data.children;

        let commentAmount = Math.min(30, comments.length);

        totalItems = commentAmount + 1;

        for (let i = 0; i < commentAmount; i++) {
            let text = comments[i].data.body;

            var urls = text.match(/\bhttps?:\/\/\S+/gi);
    
            if (urls != null) {
                for (let i = 0; i < urls.length; i++) {
                    text = text.replace(urls[i], "");
                }
            }
    
            let cleanText = getCleanText(text);
            let displayText = getDisplayText(cleanText, comments[i].data);

            saveImage('processed/comment_' + i + '.png', displayText);

            //ffmpeg -f concat -i input.txt -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -vsync vfr -pix_fmt yuv420p output.mp4
            //ffmpeg -f concat -i input.txt -vsync vfr -pix_fmt yuv420p output.mp4
    
            saveSpeech('processed/comment_' + i + '.wav', cleanText);
        }
    });
}

function saveImage(fileName, displayText) {
    //create image
    let options = {
        color: 'white',
        backgroundColor: 'black'
    };

    fs.writeFile(fileName, text2png(displayText, options), function (err) {
        if (err) console.log(err);

        //resize image
        Jimp.read(fileName, (err, image) => {
            if (err) throw err;
            image
            .contain(1920, 1080) // resize
            .write(fileName, imageSaved); // save
        });
    });
}

function imageSaved() {
    imagesProcessed++;

    console.log(soundProcessed + " " + imagesProcessed + " " + totalItems)
    //it is -1 for the title image
    if (totalItems != -1 && imagesProcessed >= totalItems && soundProcessed >= totalItems) {
        allProcessed();
    }
}

function saveSpeech(fileName, cleanText) {
    let synthesizeParams = {
        text: cleanText,
        accept: 'audio/wav',
        voice: 'en-US_MichaelVoice',
    };

    textToSpeech.synthesize(synthesizeParams)
    .then(audio => {

        let writeStream = fs.createWriteStream(fileName);

        writeStream.on('finish', function(){
            getAudioDurationInSeconds(fileName).then((duration) => {
                audioStreamLengths.push(duration);
                console.log(fileName + " " + duration)
    
                soundSaved();
            }).catch((err) => {
                console.log(err);
            });
        });

        audio.pipe(writeStream);
    })
    .catch(err => {
        console.log('error:', err);
    });
}

function soundSaved() {
    soundProcessed++;

    //it is -1 for the title image
    if (totalItems != -1 && imagesProcessed >= totalItems && soundProcessed >= totalItems) {
        allProcessed();
    }
}

function allProcessed() {
    //create input.txt
    //this file will contain a list of file names with durations
    let inputFileText = "file 'title.png'"
    inputFileText += "\nduration " + audioStreamLengths[0];
    for (let i = 0; i < totalItems - 1; i++) {
        inputFileText += "\nfile 'comment_" + i + ".png'";
        inputFileText += "\nduration " + audioStreamLengths[i + 1];

        if (i == totalItems - 1) {
            //add on the file name one more time, because the program requires it
            inputFileText += "\nfile 'comment_" + i + ".png'";
        }
    }

    fs.writeFile("./processed/input.txt", inputFileText, function(err) {
        if (err) console.log(err);

        exec('ffmpeg -f concat -i ./processed/input.txt -vsync vfr -pix_fmt yuv420p ./processed/output.mp4 -y',
            function (error, stdout, stderr) {
                if (error !== null) {
                    console.log('exec error: ' + error);
                }

                //add all the sounds together
                let audioFileText = "file 'title.wav'"
                for (let i = 0; i < totalItems - 1; i++) {
                    audioFileText += "\nfile 'comment_" + i + ".wav'";
                }

                fs.writeFile("./processed/audioList.txt", audioFileText, function(err) {
                    if (err) console.log(err);
                    
                    exec('ffmpeg -f concat -i ./processed/audioList.txt ./processed/output.wav -y',
                        function (error, stdout, stderr) {
                            if (error !== null) {
                                console.log('exec error: ' + error);
                            }
            
                            //All done, now add everything together
                            exec('ffmpeg -i ./processed/output.wav -i ./processed/output.mp4 ./processed/final_video.mp4 -y',
                                function (error, stdout, stderr) {
                                    if (error !== null) {
                                        console.log('exec error: ' + error);
                                    }
                                    
                                    console.log("Success!");
                                }
                            );
                        }
                    );
                });
            }
        );
    });
}

function getCleanText(text) {
    let cleanText = customFilter.clean(text);

    var swears = cleanText.match(/\b (\+\-\~12)+/gi);

    if (swears != null) {
        for (let i = 0; i < swears.length; i++) {
            cleanText = cleanText.replace(swears[i], " bleep");
        }
    }

    return cleanText;
}

function getDisplayText(cleanText, comment) {
    let displayText = cleanText.replace(/\b\+\-\~12/gi, "*");
    displayText = displayText.replace(/\b \+\-\~12/gi, " *");
    displayText = stringDivider(displayText, 70, "\n");

    displayText += "\n\n - " + comment.author;

    return displayText;
}

//from https://stackoverflow.com/a/14502311/1985387
function stringDivider(str, width, spaceReplacer) {
    if (str.length>width) {
        var p=width
        for (;p>0 && str[p]!=' ';p--) {
        }
        if (p>0) {
            var left = str.substring(0, p);
            var right = str.substring(p+1);
            return left + spaceReplacer + stringDivider(right, width, spaceReplacer);
        }
    }
    return str;
}