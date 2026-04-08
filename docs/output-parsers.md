# Output Parsers

Output parsers transform the raw text that an LLM produces into typed TypeScript values. Every parser also provides `getFormatInstructions()` — a string you can embed in your prompt so the LLM knows exactly what format to use.

## BaseOutputParser

```typescript
abstract class BaseOutputParser<T = string> {
  abstract parse(output: string): T
  abstract _type(): string

  // Instructions to embed in your prompt
  getFormatInstructions(): string

  // parse() with contextual error reporting
  parseWithPrompt(output: string, prompt: string): T
}
```

---

## JsonOutputParser

Extracts and parses a JSON object or array from LLM output. Handles:
- Raw JSON: `{"key": "value"}`
- Markdown fences: `` ```json\n{"key": "value"}\n``` ``
- JSON embedded in surrounding prose

```typescript
import { JsonOutputParser } from 'fireworks-plus-plus'

const parser = new JsonOutputParser()

// Raw JSON
parser.parse('{"name": "Alice", "age": 30}')
// => { name: "Alice", age: 30 }

// Markdown-fenced
parser.parse('```json\n{"score": 42}\n```')
// => { score: 42 }

// Embedded in prose
parser.parse('Sure! Here is the data: {"result": "success", "count": 7}. Hope that helps!')
// => { result: "success", count: 7 }

// Arrays
parser.parse('[1, 2, 3]')
// => [1, 2, 3]

// Format instructions for prompts
console.log(parser.getFormatInstructions())
// "Respond with a valid JSON object."
```

### Using with LLMChain

```typescript
import { ChatAnthropic, LLMChain, PromptTemplate, JsonOutputParser } from 'fireworks-plus-plus'

const parser = new JsonOutputParser()
const prompt = PromptTemplate.fromTemplate(
  `Return JSON about this country: {country}
Fields: name, capital, population, continent.

${parser.getFormatInstructions()}`
)

const chain = new LLMChain(new ChatAnthropic(), prompt, { outputParser: parser })
const result = await chain.run('Japan')
console.log(result.capital)    // "Tokyo"
console.log(result.continent)  // "Asia"
```

### ParseError

When parsing fails, `JsonOutputParser` throws a `ParseError` with the original output attached:

```typescript
import { ParseError } from 'fireworks-plus-plus'

try {
  parser.parse('This is not JSON at all.')
} catch (e) {
  if (e instanceof ParseError) {
    console.error('Failed to parse:', e.message)
    console.error('Original output:', e.output)
  }
}
```

---

## StructuredOutputParser

Parses named fields from LLM output. Tries JSON first, then falls back to `key: value` line extraction. Fields can be typed and marked required.

```typescript
import { StructuredOutputParser } from 'fireworks-plus-plus'

// Create from field descriptions (all fields treated as strings)
const parser = StructuredOutputParser.fromNamesAndDescriptions({
  title: 'The title of the article',
  summary: 'A one-paragraph summary of the article',
  sentiment: 'The overall sentiment: Positive, Negative, or Neutral',
  score: 'A relevance score between 0 and 10'
})

// Parses JSON format
parser.parse('{"title":"AI Advances","summary":"Researchers...","sentiment":"Positive","score":"9"}')
// => { title: "AI Advances", summary: "Researchers...", sentiment: "Positive", score: "9" }

// Also parses key:value format
parser.parse('title: AI Advances\nsummary: Researchers...\nsentiment: Positive\nscore: 9')
// => { title: "AI Advances", summary: "Researchers...", sentiment: "Positive", score: "9" }
```

### Full Schema Definition

For type coercion on specific fields:

```typescript
import { StructuredOutputParser } from 'fireworks-plus-plus'
import type { OutputSchema } from 'fireworks-plus-plus'

const schema: OutputSchema = {
  name: { type: 'string', description: 'Full name', required: true },
  age: { type: 'number', description: 'Age in years', required: true },
  active: { type: 'boolean', description: 'Is this person active?', required: false },
  tags: { type: 'array', description: 'List of relevant tags', required: false }
}

const parser = new StructuredOutputParser(schema)

const result = parser.parse('{"name":"Bob","age":"35","active":"true","tags":["dev","ts"]}')
// age is coerced to number: 35
// active is coerced to boolean: true
console.log(typeof result.age)    // "number"
console.log(typeof result.active) // "boolean"
```

### Format Instructions

```typescript
console.log(parser.getFormatInstructions())
// "You must respond with a JSON object containing the following fields:
//  - name (string) (required): Full name
//  - age (number) (required): Age in years
//  - active (boolean) (optional): Is this person active?
//  - tags (array) (optional): List of relevant tags
//
//  Format your response as a valid JSON object. Example:
//  {
//    "name": <value>,
//    "age": <value>,
//    ...
//  }"
```

### Using with LLMChain

```typescript
import { StructuredOutputParser, LLMChain, PromptTemplate, ChatAnthropic } from 'fireworks-plus-plus'

const parser = StructuredOutputParser.fromNamesAndDescriptions({
  pros: 'Three pros, comma-separated',
  cons: 'Three cons, comma-separated',
  verdict: 'One-sentence overall verdict'
})

const prompt = PromptTemplate.fromTemplate(
  `Analyse the pros and cons of: {subject}

${parser.getFormatInstructions()}`
)

const chain = new LLMChain(new ChatAnthropic(), prompt, { outputParser: parser })
const result = await chain.run('working from home')
console.log(result.pros)
console.log(result.verdict)
```

---

## CommaSeparatedListOutputParser

Parses a comma-separated list into a string array.

```typescript
import { CommaSeparatedListOutputParser } from 'fireworks-plus-plus'

const parser = new CommaSeparatedListOutputParser()

parser.parse('apples, bananas, cherries')
// => ["apples", "bananas", "cherries"]

parser.parse('  TypeScript , JavaScript,  Python  ')
// => ["TypeScript", "JavaScript", "Python"]

console.log(parser.getFormatInstructions())
// "Your response should be a list of comma separated values, eg: foo, bar, baz"
```

---

## NumberedListOutputParser

Parses a numbered list (with `1.` or `1)` prefix) into a string array.

```typescript
import { NumberedListOutputParser } from 'fireworks-plus-plus'

const parser = new NumberedListOutputParser()

parser.parse('1. Install Node.js\n2. Run npm install\n3. Start the server')
// => ["Install Node.js", "Run npm install", "Start the server"]

parser.parse('1) First item\n2) Second item\n3) Third item')
// => ["First item", "Second item", "Third item"]

console.log(parser.getFormatInstructions())
// "Your response should be a numbered list of items, eg:\n1. item one\n2. item two"
```

---

## LineOutputParser

Parses newline-separated text into a string array, one item per line.

```typescript
import { LineOutputParser } from 'fireworks-plus-plus'

const parser = new LineOutputParser()

parser.parse('First line\nSecond line\nThird line')
// => ["First line", "Second line", "Third line"]

// Empty lines are filtered out
parser.parse('Line 1\n\nLine 2\n  \nLine 3')
// => ["Line 1", "Line 2", "Line 3"]
```

---

## Using Parsers Without a Chain

You can use output parsers independently of chains:

```typescript
import { ChatAnthropic, JsonOutputParser } from 'fireworks-plus-plus'

const llm = new ChatAnthropic()
const parser = new JsonOutputParser()

const reply = await llm.call([{
  role: 'human',
  content: `Return a JSON object with fields "word" and "definition" for: serendipity.
${parser.getFormatInstructions()}`
}])

const parsed = parser.parse(reply.content)
console.log(parsed.word)       // "serendipity"
console.log(parsed.definition) // "..."
```

---

## Error Handling

All parsers throw a `ParseError` on failure. Use `parseWithPrompt()` for better debugging output:

```typescript
import { StructuredOutputParser, ParseError } from 'fireworks-plus-plus'

const parser = StructuredOutputParser.fromNamesAndDescriptions({
  answer: 'The answer',
  confidence: 'Confidence level 0-100'
})

const rawOutput = 'I am not sure about this.'
const prompt = 'Answer the question with JSON...'

try {
  const result = parser.parseWithPrompt(rawOutput, prompt)
} catch (e) {
  if (e instanceof ParseError) {
    console.error(e.message)
    // Includes both the prompt and the raw output for debugging
  }
}
```
