const fs = require('fs');
const requests = require("request");
var text2png = require('text2png');

const TextToSpeechV1 = require("ibm-watson/text-to-speech/v1");

//remove swearing
var Filter = require('bad-words');
var customFilter = new Filter({ placeHolder: '+-~12'});

let config = JSON.parse(fs.readFileSync('config.json'));

const textToSpeech = new TextToSpeechV1({
    iam_apikey: config.apiKey,
    url: 'https://gateway-wdc.watsonplatform.net/text-to-speech/api'
});

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

    //create image
    fs.writeFile('processed/title.png', text2png(displayText, {color: 'white'}), function (err) {
        if (err) console.log(err);
    });

    let synthesizeParams = {
        text: cleanText,
        accept: 'audio/wav',
        voice: 'en-US_MichaelVoice',
    };

    textToSpeech.synthesize(synthesizeParams)
    .then(audio => {
        audio.pipe(fs.createWriteStream('processed/title.wav'));
    })
    .catch(err => {
        console.log('error:', err);
    });

    getComments(posts[randomPostIndex]);
});

function getComments(post) {
    let url = post.data.url;

    requests.get(url.substring(0, url.length - 2) + ".json", {}, function(err, res, body) {
        let response = JSON.parse(body);

        let comments = response[1].data.children;

        for (let i = 0; i < Math.min(20, comments.length); i++) {
            let text = comments[i].data.body;

            var urls = text.match(/\bhttps?:\/\/\S+/gi);
    
            if (urls != null) {
                for (let i = 0; i < urls.length; i++) {
                    text = text.replace(urls[i], "");
                }
            }
    
            let cleanText = getCleanText(text);
            let displayText = getDisplayText(cleanText, comments[i].data);

            //create image
            fs.writeFile('processed/comment_' + i + '.png', text2png(displayText, {color: 'white'}), function (err) {
                if (err) console.log(err);
            });
    
            let synthesizeParams = {
                text: cleanText,
                accept: 'audio/wav',
                voice: 'en-US_MichaelVoice',
            };
        
            textToSpeech.synthesize(synthesizeParams)
            .then(audio => {
                audio.pipe(fs.createWriteStream('processed/comment_' + i + '.wav'));
            })
            .catch(err => {
                console.log('error:', err);
            });
        }
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