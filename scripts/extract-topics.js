var fs = require('fs');
var path = require('path');

var args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node extract-topics.js <jsonl-path> [output-dir] [--topic N]');
  console.error('  jsonl-path  : Path to conversation JSONL file');
  console.error('  output-dir  : Output directory (default: ./ai-tutor/raw-document)');
  console.error('  --topic N   : Only extract topic N (default: all)');
  process.exit(1);
}

var JSONL_PATH = path.resolve(args[0]);
var OUT_DIR = args[1] ? path.resolve(args[1]) : path.join(process.cwd(), 'ai-tutor', 'raw-document');
var FILTER_TOPIC = null;
for (var i = 2; i < args.length; i++) {
  if (args[i] === '--topic' && args[i + 1]) {
    FILTER_TOPIC = parseInt(args[i + 1], 10);
    break;
  }
}

if (!fs.existsSync(JSONL_PATH)) {
  console.error('Error: JSONL file not found: ' + JSONL_PATH);
  process.exit(1);
}

function extractText(msg) {
  if (!msg || !msg.message || !msg.message.content) return '';
  var c = msg.message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.filter(function (b) { return b.type === 'text' && b.text; })
      .map(function (b) { return b.text; })
      .join('\n');
  }
  return '';
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

function main() {
  var data = fs.readFileSync(JSONL_PATH, 'utf8');
  var lines = data.split('\n').filter(function (l) { return l.trim(); });
  if (!lines.length) {
    console.error('Error: Empty JSONL file');
    process.exit(1);
  }

  var messages = [];
  for (var i = 0; i < lines.length; i++) {
    try {
      var m = JSON.parse(lines[i]);
      if (m.message && m.message.content) {
        messages.push({ index: i, msg: m, text: extractText(m), role: m.message.role });
      }
    } catch (e) { /* skip bad lines */ }
  }

  var topics = [];
  for (var j = 0; j < messages.length; j++) {
    var t = messages[j].text;
    if (messages[j].role !== 'assistant') continue;
    var match = t.match(/(?:主题|Topic)\s*(\d+)\s*[:：]\s*(.+)/);
    if (!match) continue;
    var topicNum = parseInt(match[1], 10);
    var topicName = match[2].replace(/\*\*.*$/, '').replace(/[—\-–,，。；;].*$/, '').replace(/\*/g, '').trim();

    if (topics.length > 0 && topics[topics.length - 1].endIdx === null) {
      topics[topics.length - 1].endIdx = j - 1;
    }

    var teachingEnd = t.length;
    var assessMarkers = ['## 考核开始', '## 考核时间', '---\n\n## 考核', '## 考核（', '## 考核（3'];
    for (var am = 0; am < assessMarkers.length; am++) {
      var aidx = t.indexOf(assessMarkers[am]);
      if (aidx !== -1 && aidx < teachingEnd && aidx > 200) {
        teachingEnd = aidx;
      }
    }
    if (teachingEnd === t.length) {
      var doneMarker = t.indexOf('全部');
      if (doneMarker !== -1 && t.indexOf('子节讲解完毕') !== -1 && doneMarker > 200) {
        var dashBefore = t.lastIndexOf('---', doneMarker);
        if (dashBefore !== -1 && dashBefore > 200) teachingEnd = dashBefore;
      }
    }

    topics.push({
      num: topicNum,
      name: topicName,
      startIdx: j,
      endIdx: null,
      teachingText: t.substring(0, teachingEnd).trim(),
      fullText: t
    });
  }

  if (topics.length > 0 && topics[topics.length - 1].endIdx === null) {
    topics[topics.length - 1].endIdx = messages.length - 1;
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  var extracted = 0;
  for (var k = 0; k < topics.length; k++) {
    var tp = topics[k];
    if (FILTER_TOPIC && tp.num !== FILTER_TOPIC) continue;

    var filename = 'topic' + tp.num + '-' + slugify(tp.name) + '.md';
    var filepath = path.join(OUT_DIR, filename);

    var output = '# Topic ' + tp.num + ': ' + tp.name + '\n\n';
    output += '> Extracted from conversation log.\n\n';
    output += '---\n\n';
    output += '## 讲解内容\n\n' + tp.teachingText + '\n\n';
    output += '---\n\n## 考核记录\n\n';

    for (var mi = tp.startIdx + 1; mi <= tp.endIdx; mi++) {
      var cm = messages[mi];
      if (!cm || cm.text.length < 30) continue;
      if (cm.text.indexOf('Fact-Forcing') !== -1) continue;
      if (cm.text.indexOf('command-message') !== -1) continue;
      if (cm.text.indexOf('local-command-caveat') !== -1) continue;

      var isNextTopic = false;
      for (var nt = 0; nt < topics.length; nt++) {
        if (topics[nt].startIdx === mi) { isNextTopic = true; break; }
      }
      if (isNextTopic) break;

      if (cm.role === 'user') {
        output += '### 我的回答\n\n' + cm.text + '\n\n';
      } else if (cm.role === 'assistant') {
        output += cm.text + '\n\n';
      }
    }

    fs.writeFileSync(filepath, output, 'utf8');
    console.log('[OK] ' + filename + ' (teaching: ' + (tp.teachingText.length / 1024).toFixed(1) + 'KB, total: ' + (output.length / 1024).toFixed(1) + 'KB)');
    extracted++;
  }

  if (extracted === 0) {
    console.log('[WARN] No topics found in JSONL file');
  } else {
    console.log('\nDone: ' + extracted + ' topic(s) extracted to ' + OUT_DIR);
  }
}

try { main(); } catch (err) {
  console.error('Error: ' + err.message);
  console.error(err.stack);
  process.exit(1);
}
