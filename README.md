# discord-ticket-helper

Генератор красивых HTML-транскриптов для Discord каналов и тикет-систем.

## Возможности

- Полная история сообщений с пагинацией (по 100 сообщений за запрос)
- Группировка сообщений одного автора в пределах 60 секунд
- Рендеринг Discord Markdown (жирный, курсив, подчёркнутый, зачёркнутый, спойлеры, цитаты, списки, заголовки, код-блоки, ссылки)
- Упоминания (@user, @role, #channel) с цветами ролей и копированием ID по клику
- Discord-темы и пользовательские эмодзи (CDN-ссылки)
- Timestamps в форматах `<t:123456:R>` (относительное время)
- Эмбеды (author, title, URL, description, fields, thumbnail, image, footer, color)
- Вложения: картинки в галерее, файлы с метаданными
- Discord компоненты v2 (кнопки, селекты, галереи, секции, контейнеры)
- Системные сообщения (добавление/удаление пользователей из ветки)
- Аватары пользователей с displayColor акцентом
- Авто-редактирование меток (`edited`)
- Адаптивные анимации
- Копирование ID по клику на имени/упоминании с toast-уведомлением
- Кастомные цвета акцента, локализация дат (ru-RU, en-US и т.д.)
- Возврат как AttachmentBuilder (для отправки в Discord), так и HTML-строки/файла
- Работа без discord.js (требуется только для AttachmentBuilder)

## Установка

```bash
npm install discord-ticket-helper
```

## Быстрый старт

```js
const { Client, GatewayIntentBits } = require('discord.js');
const { generateTranscript } = require('discord-ticket-helper');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== 'close_ticket') return;

    const thread = interaction.channel;
    const ticketData = {
        ticketId: 123,
        userId: interaction.user.id,
        reason: 'Помощь с заказом',
        createdAt: new Date(),
    };

    const result = await generateTranscript(thread, {
        ticket: ticketData,
        outputDir: './transcripts',
        locale: 'ru-RU',
        accentColor: '#60a5fa',
    });

    if (result) {
        await interaction.reply({
            content: 'Транскрипт тикета:',
            files: [result.attachment],
        });
    }
});

client.login('TOKEN');
```

## API

### `generateTranscript(channel, options?)`

Генерирует полный транскрипт канала/треда. Возвращает Promise с объектом:

```ts
{
  html: string;           // Готовый HTML-документ (строка)
  buffer: Buffer;         // HTML в виде Buffer
  filePath: string | null; // Путь к сохранённому файлу (если saveToFile=true)
  attachment: AttachmentBuilder | null; // Discord.js AttachmentBuilder (если библиотека доступна)
  fileName: string;       // Имя HTML-файла
  messageCount: number;   // Количество обработанных сообщений
}
```

#### Параметры `options`:

| Опция | Тип | По умолчанию | Описание |
|---|---|---|---|
| `ticket` | `object \| null` | `null` | Метаданные тикета: `{ ticketId, userId, moderatorId, reason, createdAt, department, status }` |
| `outputDir` | `string \| null` | `./transcripts` | Директория для сохранения HTML |
| `saveToFile` | `boolean` | `true` | Сохранять ли на диск |
| `locale` | `string` | `'ru-RU'` | Локаль для дат/времени (`'en-US'`, `'de-DE'` и т.д.) |
| `accentColor` | `string` | `'#60a5fa'` | HEX-цвет акцента интерфейса |
| `footerText` | `string \| null` | `null` | Кастомный текст в футере |
| `title` | `string \| null` | `null` | Заголовок (по умолчанию: номер тикета или имя канала) |
| `messages` | `Message[] \| null` | `null` | Если передан — использует эти сообщения вместо загрузки из канала |
| `messageLimit` | `number` | `-1` | Ограничение по количеству сообщений (-1 = все) |

### `generateTranscriptHtmlOnly(channel, options?)`

То же самое, что `generateTranscript`, но возвращает **только** HTML-строку. Удобно для интеграции в веб-интерфейсы.

### `generateTranscriptFromMessages(messages, options?)`

Генерирует транскрипт из массива готовых сообщений, без обращения к Discord API. Полезно для кешированных или импортированных данных.

```js
const result = await generateTranscriptFromMessages(cachedMessages, {
    guild: interaction.guild,
    channelId: '123',
    channelName: 'ticket-001',
    ticket: { ticketId: 1, reason: 'test' },
});
```

### Утилиты (`require('discord-ticket-helper').utils`)

```js
const { utils } = require('discord-ticket-helper');

utils.escapeHtml('<script>');               // '&lt;script&gt;'
utils.sanitizeUrl('https://example.com');   // 'https://example.com'
utils.hexToRgb('#ff0000');                  // { r: 255, g: 0, b: 0 }
utils.formatDateTime(Date.now(), 'ru-RU');  // '21:45 25.08.2026'
utils.formatTime(Date.now());               // '21:45'
utils.formatTranscriptTimestamp(ms, 'f', 'ru-RU');
utils.formatTranscriptRelativeTime(targetMs, nowMs, 'en-US');
utils.isLikelyImage({ contentType: 'image/png' }); // true
utils.groupMessages(messages);              // Группировка по авторам
utils.fetchAllMessages(channel, limit);     // Загрузка всех сообщений
```

### Константы (`require('discord-ticket-helper').constants`)

```js
const { constants } = require('discord-ticket-helper');
constants.COMPONENT_TYPE.Button // 2
constants.BUTTON_STYLE.Success // 3
constants.MESSAGE_TYPE.RecipientAdd // 1
```

## Примеры

### 1. Экспорт любого текстового канала (не только тикета)

```js
const { generateTranscript } = require('discord-ticket-helper');

// В команде /export #channel
const channel = interaction.options.getChannel('channel');
const result = await generateTranscript(channel, {
    title: `export-${channel.name}`,
    outputDir: './exports',
    locale: 'en-US',
    accentColor: '#a78bfa',
});

await interaction.reply({ files: [result.attachment], ephemeral: true });
```

### 2. Без discord.js (просто HTML)

```js
const { generateTranscriptFromMessages } = require('discord-ticket-helper');

const myMessages = [
    {
        id: '1',
        author: { id: '123', username: 'Alice', tag: 'Alice#0001', displayAvatarURL: () => 'https://...' },
        member: { displayName: 'Алиса', displayHexColor: '#ff6b6b', displayAvatarURL: () => 'https://...' },
        content: 'Привет! Как дела?',
        createdTimestamp: Date.now() - 60000,
        attachments: new Map(),
        embeds: [],
        components: [],
        system: false,
        mentions: { users: new Map(), members: new Map() },
        guild: { members: { cache: new Map() }, roles: { cache: new Map() }, channels: { cache: new Map() } },
    },
    // ... ещё сообщения
];

const html = await generateTranscriptFromMessages(myMessages, {
    channelName: 'общение',
    guild: { name: 'Мой сервер', iconURL: () => null, id: 'g1' },
});
console.log('HTML ready, length:', html.length);
```

### 3. Ограничение числа сообщений

```js
// Последние 50 сообщений
const result = await generateTranscript(channel, { messageLimit: 50 });
```

## Структура выходного HTML

- Самодостаточный (inline CSS + JS, нет внешних зависимостей)
- Тёмная тема с градиентами и анимациями
- Hero-секция: иконка гильдии, заголовок
- Карточка Details: метаданные тикета/канала
- Секция Messages: все сообщения с группировкой
- Footer + toast-скрипт копирования ID

Открывается в любом браузере без подключения к интернету (кроме CDN-изображений Discord).

## Требования

- Node.js >= 16
- discord.js >= 14 (опционально, только для `AttachmentBuilder` и загрузки сообщений из канала)

## Лицензия

MIT
