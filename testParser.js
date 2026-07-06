const fs = require('fs');
const path = require('path');

const tsPath = path.join(__dirname, 'src', 'domain/parsing/parseLogs.ts');
let code = fs.readFileSync(tsPath, 'utf8');

// Strip TS
code = code
  .replace(/import\s+.*?;/g, '')
  .replace(/:\s*LogLevel\[\]/g, '')
  .replace(/:\s*LogLevel/g, '')
  .replace(/:\s*LogEntry\[\]/g, '')
  .replace(/:\s*LogEntry\s*\|\s*null/g, '')
  .replace(/:\s*string\[\]/g, '')
  .replace(/:\s*string/g, '')
  .replace(/:\s*number/g, '')
  .replace(/:\s*boolean/g, '')
  .replace(/:\s*Set<LogLevel>/g, '')
  .replace(/as\s+LogLevel/g, '')
  .replace(/export\s+function/g, 'function')
  .replace(/export\s+type\s+.*?;/g, '')
  .replace(/export\s+interface\s+[\s\S]*?\}/g, '');

code += '\nmodule.exports = { parseLogs };';
const jsParserPath = path.join(__dirname, 'tempParser.js');
fs.writeFileSync(jsParserPath, code);

const { parseLogs } = require(jsParserPath);

const logFiles = [
  '/home/andreudev/Downloads/Logs capa media/1204.crea_desembolsa_referido.log',
  '/home/andreudev/Downloads/Logs capa media/capa-media-logger 129.log',
  '/home/andreudev/Downloads/Logs capa media/capa-media-logger 130.log',
  '/home/andreudev/Downloads/Logs capa media/consulta_productos 16-18Hrs.txt'
];

logFiles.forEach(file => {
  console.log(`\n========================================`);
  console.log(`Analysing: ${path.basename(file)}`);
  try {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const entries = parseLogs(text);

    // Date regex check
    const dateRegex = /^(?:\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})|^(?:\d{1,2}\/\d{1,2}\/\d{4}\s\d{1,2}:\d{2}:\d{2})|^(?:\[\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}:\d{2})/;

    let unmatchedTimestampsCount = 0;
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      if (line.trim() === '') return;
      
      if (dateRegex.test(line)) {
        // Check if this line is in the raw property of any parsed entry
        const isCaptured = entries.some(e => e.raw.includes(line.trim()));
        if (!isCaptured) {
          unmatchedTimestampsCount++;
          if (unmatchedTimestampsCount <= 10) {
            console.log(`Line ${lineNum} starts with a date but was NOT captured! Content:`);
            console.log(`  ${line}`);
          }
        }
      }
    });

    console.log(`Total unmatched lines starting with a date: ${unmatchedTimestampsCount}`);
  } catch (err) {
    console.error(`Error parsing ${file}:`, err);
  }
});

// Clean up
fs.unlinkSync(jsParserPath);
