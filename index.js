const fs = require('fs');
const requests = require("request");
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

    let synthesizeParams = {
        text: posts[randomPostIndex].data.title,
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
    // url = "https://google.com/aa"
    requests.get(url.substring(0, url.length - 2) + ".json", {}, function(err, res, body) {
        let response = JSON.parse(body);

        let comments = response[1].data.children;

        for (let i = 0; i < Math.min(20, comments.length); i++) {
            let text = comments[i].data.body;

            var urls = text.match(/\bhttps?:\/\/\S+/gi);
    
            if (urls != null) {
                for (let i = 0; i < urls.length; i++) {
                    text = text.replace(urls[i], "");
                    console.log(urls[i])
                }
            }
    
            let cleanText = customFilter.clean(text);
    
            var swears = cleanText.match(/\b (\+\-\~12)+/gi);
    
            if (swears != null) {
                for (let i = 0; i < swears.length; i++) {
                    cleanText = cleanText.replace(swears[i], " bleep");
                }
            }
    
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