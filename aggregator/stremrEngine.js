let Parser = require('rss-parser');
let parser = new Parser();
const extract = require('meta-extractor');
var keyword_extractor = require("keyword-extractor");
var fs = require("fs");
var stringSimilarity = require('string-similarity');
const fetch = require('node-fetch'); 
const {
  performance
} = require('perf_hooks');

Array.prototype.removeIf = function(str) {
  var i = this.length;
  while (i--) {
    if (this[i] === str) {
        this.splice(i, 1);
    }
  }
};

async function loopRSSFeed (item, provider) {
  return new Promise((resolve, reject) => {
    var result = new Object();

    result.title = item.title;
    result.provider = provider;
    result.link = item.link;
    //console.log(item);

    if (item.link == null){
      reject("Could not access link.");
    }else{
      extract({ uri: result.link })
      .then(res => {
        var cleanStr = '';
        if (typeof res.ogDescription != 'undefined')
        {
          cleanStr += res.ogDescription.trim() + ' ';
        }
        if (typeof res.ogTitle != 'undefined')
        {
          cleanStr += res.ogTitle.trim();
        }
        if (cleanStr === '')
        {
          reject("No title or description detected.")
        }

        result.tags = keyword_extractor.extract(cleanStr,{
          language:"english",
          remove_digits: true,
          return_changed_case:true,
          remove_duplicates: true
        });

        result.tags.removeIf("-");
        result.tags.removeIf("--");
        result.tags.removeIf("ap");
        result.tags.removeIf("cnn video");
        result.tags.removeIf("|");

        result.cleanedCompare = result.tags.join(' ');

        console.log('---------------------+Metadata+---------------------');
        console.log("Getting additional info for:" + result.link);
        console.log(result.cleanedCompare);
        
        console.log('----------------------------------------------------');

        result.metadata = res;

        resolve(result)
      }).catch(err => {console.error(err)
        console.log(err);
        resolve(result);
      });
    }
  });
};

async function getRssFeedContent(url, provider) {
  return new Promise((resolve, reject) => {
    x = 0;
    (async () => {
      console.log('...Starting ' + provider + '...');
      let feed = await parser.parseURL(url);
      let len = feed.items.length;
      if (len > 10){
        len = 10;
      }
      let fillArr = [];
      //console.log(feed.items.length);
      for (let i=0; i < len; i++){
        let loopPromise = await loopRSSFeed(feed.items[i], provider);
        if (loopPromise != null){
          fillArr.push(loopPromise);
        }
      }
      console.log('...Ending ' + provider + '...');
      resolve(fillArr);
    })();
  });
};

//So far just for AP - they don't have RSS
async function getJsonFeedContent(url, provider) {
  return new Promise((resolve, reject) => {
    fetch(url).then(res => res.text()).then(body => {
      (async () => {
        console.log('...Starting ' + provider + '...');
        let json = JSON.parse(body);
        let fillArr = [];

        for (let i=0; i < json.cards.length; i++){
          var jsonObj = new Object();

          jsonObj.title = json.cards[i].contents[0].headline;
          jsonObj.link = json.cards[i].contents[0].localLinkUrl;
          if (jsonObj.link != null){
            let loopPromise = await loopRSSFeed(jsonObj, provider);
            fillArr.push(loopPromise);
          }
        }
        console.log('...Ending ' + provider + '...');
        resolve(fillArr);
      })();
    });
  });
};

const buildSimilarArray = function (arr, variance) {
  let builtArr = [], usedElem = [];

  for (let i = 0; i<arr.length; i++){
    let currNode = [];
    if (usedElem.indexOf(i) == -1){
      let elem = arr[i];
      currNode.push(elem);
      
      console.log('--------------+Searching for Similar+--------------');
      console.log(elem.title + ' (' + elem.provider + ')');
      console.log(elem.cleanedCompare);
      console.log(elem.link);
      console.log('---------------------------------------------------');

      for (let j = 0; j<arr.length; j++){
        let compare = arr[j];
        if (i !== j && usedElem.indexOf(j) == -1 && currNode.indexOf(compare) == -1){
          try{
            let threshold = stringSimilarity.compareTwoStrings(elem.cleanedCompare, compare.cleanedCompare);
            if (threshold > variance)
            {
              console.log('--------------+Found Similar ('+ threshold +')+----------------');
              console.log(threshold)
              console.log(compare.title + ' (' + compare.provider + ')');
              console.log(compare.cleanedCompare);
              console.log(compare.link);
              compare.threshold = threshold;
              //console.log(compare.summary.join("\n"));
              console.log('---------------------------------------------------');

              usedElem.push(j);
              currNode.push(compare);          
            }
          }catch(error){
            console.log("Could not compare: " + error);
          }
        }
      }
    }
    if (currNode.length > 1){
      builtArr.push(currNode);
    }
  }
  return builtArr;
}

async function createJSON(list, name, variance) {
  var a = performance.now(), mergeList = [];

  for (let i = 0; i<list.length; i++){
    try {     
      var results = [];
      if (list[i].provider == 'AP'){
        results = await getJsonFeedContent(list[i].link, list[i].provider);
      }else{
        results = await getRssFeedContent(list[i].link, list[i].provider);
      }
      mergeList = mergeList.concat(results);
    }catch (error) {
      console.log(error.message);
    }
  }

  let builtArr = buildSimilarArray(mergeList, variance).sort((a, b) => b.length - a.length);
  var path = __dirname + '/../webserver/JSON/';
  fs.writeFile(path + name, JSON.stringify(builtArr), (err) => {
    if (err) {
        console.error(err);
        return;
    };
    console.log("---" + name + " File has been created---");
  });

  var b = performance.now();
  var ms = (b - a), min = Math.floor((ms/1000/60) << 0), sec = Math.floor((ms/1000) % 60);
  console.log("Time: " + min + ':' + sec);
}

(async () => {
  let topNewsArr = [
    {'link': 'https://afs-prod.appspot.com/api/v2/feed/tag?tags=apf-topnews', 'provider': 'AP'},
    {'link': 'http://rss.cnn.com/rss/cnn_topstories.rss', 'provider': 'CNN'},
    {'link': 'http://feeds.foxnews.com/foxnews/latest', 'provider': 'Fox'},
    {'link': 'http://feeds.reuters.com/reuters/topNews', 'provider': 'Reuters'},
    {'link': 'http://www.msnbc.com/feeds/latest', 'provider': 'MSNBC'},
    {'link': 'https://abcnews.go.com/abcnews/topstories', 'provider': 'ABC'},
    {'link': 'https://www.cbsnews.com/latest/rss/main', 'provider': 'CBS'},
    {'link': 'https://www.cnbc.com/id/100003114/device/rss/rss.html', 'provider': 'CNBC'},
    {'link': 'http://thehill.com/rss/syndicator/19110', 'provider': 'The Hill'},
    {'link': 'http://rssfeeds.usatoday.com/usatoday-newstopstories&x=1', 'provider': 'USA Today'}
  ];

  createJSON(topNewsArr, 'topNews.json', 0.50);
    
  let usNewsArr = [
    {'link': 'https://afs-prod.appspot.com/api/v2/feed/tag?tags=apf-usnews', 'provider': 'AP'},
    {'link': 'http://rss.cnn.com/rss/cnn_us.rss', 'provider': 'CNN'},
    {'link': 'http://feeds.foxnews.com/foxnews/national', 'provider':'Fox'},
    {'link': 'https://www.cnbc.com/id/15837362/device/rss/rss.html', 'provider': 'CNBC'},
    {'link': 'https://abcnews.go.com/abcnews/usheadlines', 'provider': 'ABC'},
    {'link': 'http://feeds.reuters.com/Reuters/domesticNews', 'provider': 'Reuters'},
    {'link': 'https://www.cbsnews.com/latest/rss/us', 'provider': 'CBS'},
    {'link': 'http://rssfeeds.usatoday.com/usatodaycomnation-topstories&x=1', 'provider': 'USA Today'},
    {'link': 'http://feeds.washingtonpost.com/rss/national', 'provider': 'Washington Post'},
    {'link': 'http://rss.nytimes.com/services/xml/rss/nyt/US.xml', 'provider': 'NY Times'}
  ];

  createJSON(usNewsArr, 'usNews.json', 0.55);

  let politicsArr = [
    {'link': 'https://afs-prod.appspot.com/api/v2/feed/tag?tags=apf-politics', 'provider': 'AP'},
    {'link': 'http://rss.cnn.com/rss/cnn_allpolitics.rss', 'provider': 'CNN'},
    {'link': 'http://feeds.foxnews.com/foxnews/politics', 'provider': 'Fox'},
    {'link': 'https://www.politico.com/rss/politics08.xml', 'provider': 'Politico'},
    {'link': 'http://feeds.washingtonpost.com/rss/politics', 'provider': 'Washington Post'},
    {'link': 'https://www.nationalreview.com/feed/', 'provider': 'National Review'},
    {'link': 'https://www.cnbc.com/id/10000113/device/rss/rss.html', 'provider': 'CNBC'},
    {'link': 'https://abcnews.go.com/abcnews/politicsheadlines', 'provider': 'ABC'},
    {'link': 'http://feeds.reuters.com/Reuters/PoliticsNews', 'provider': 'Reuters'},
    {'link': 'https://www.cbsnews.com/latest/rss/politics', 'provider': 'CBS'},
    {'link': 'http://rssfeeds.usatoday.com/usatodaycomwashington-topstories&x=1', 'provider': 'USA Today'}
  ];

  createJSON(politicsArr, 'politics.json', 0.55);

  let worldArr = [
    {'link': 'https://afs-prod.appspot.com/api/v2/feed/tag?tags=apf-intlnews', 'provider': 'AP'},
    {'link': 'http://feeds.bbci.co.uk/news/world/rss.xml', 'provider': 'BBC'},
    {'link': 'https://www.huffingtonpost.com/section/world-news/feed', 'provider': 'HuffPo'},
    {'link': 'http://feeds.reuters.com/Reuters/WorldNews', 'provider': 'Reuters'},
    {'link': 'http://rss.cnn.com/rss/cnn_world.rss', 'provider': 'CNN'},
    {'link': 'http://feeds.foxnews.com/foxnews/world', 'provider': 'Fox'},
    {'link': 'http://feeds.washingtonpost.com/rss/world', 'provider': 'Washington Post'},
    {'link': 'https://www.cnbc.com/id/100727362/device/rss/rss.html', 'provider': 'CNBC'},
    {'link': 'https://abcnews.go.com/abcnews/internationalheadlines', 'provider': 'ABC'},
    {'link': 'https://www.cbsnews.com/latest/rss/world', 'provider': 'CBS'},
    {'link': 'http://rssfeeds.usatoday.com/UsatodaycomWorld-TopStories', 'provider': 'USA Today'}
  ];

  createJSON(worldArr, 'world.json', 0.55);
})();