const { generateTranscriptFromMessages, utils } = require('../src/index');

const sampleGuild = {
    id: '1000000000000000001',
    name: 'Aetheris Demo',
    iconURL: () => null,
    members: { cache: new Map() },
    roles: { cache: new Map() },
    channels: { cache: new Map() },
};

function makeUser(displayName, username, color, tag) {
    const id = String(Date.now() + Math.floor(Math.random() * 1e9));
    const avatar = `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5)}.png`;
    return {
        author: {
            id,
            username,
            globalName: displayName,
            tag: tag || `${username}#0001`,
            displayAvatarURL: () => avatar,
        },
        member: {
            id,
            displayName,
            displayHexColor: color,
            displayAvatarURL: () => avatar,
            roles: { cache: new Map() },
        },
    };
}

const alice = makeUser('Алиса', 'alice_dev', '#f472b6', 'alice#0420');
const bob = makeUser('Боб Модератор', 'bob_mod', '#60a5fa', 'bob#1337');

const now = Date.now();
const messages = [
    {
        ...alice,
        id: 'm1',
        content: 'Привет! Хочу открыть тикет по поводу **DS Market заказа**.\n\nМой заказ #481, не пришёл товар :(',
        createdTimestamp: now - 15 * 60 * 1000,
        attachments: new Map(),
        embeds: [],
        components: [],
        system: false,
        mentions: { users: new Map(), members: new Map() },
        guild: sampleGuild,
    },
    {
        ...bob,
        id: 'm2',
        content: 'Добрый день, @Алиса! Сейчас разберёмся. Давайте детали:',
        createdTimestamp: now - 14 * 60 * 1000,
        attachments: new Map(),
        embeds: [],
        components: [],
        system: false,
        mentions: { users: new Map([[alice.author.id, alice.author]]), members: new Map([[alice.author.id, alice.member]]) },
        guild: sampleGuild,
    },
    {
        ...bob,
        id: 'm3',
        content: '- Скриншот оплаты прилагали?\n- Никнейм получателя?\n```js\nconsole.log("debug block");\n```',
        createdTimestamp: now - 13 * 55 * 1000,
        attachments: new Map(),
        embeds: [],
        components: [],
        system: false,
        mentions: { users: new Map(), members: new Map() },
        guild: sampleGuild,
    },
    {
        ...alice,
        id: 'm4',
        content: 'Вот <@&' + sampleGuild.id + '> скрин: ||спойлер правда кривой||, время <t:' + Math.floor(now / 1000) + ':R>',
        createdTimestamp: now - 12 * 60 * 1000,
        attachments: new Map([
            [
                'att1',
                {
                    name: 'screenshot_payment.png',
                    url: 'https://cdn.discordapp.com/attachments/123/456/screenshot_payment.png',
                    contentType: 'image/png',
                    size: 482190,
                },
            ],
        ]),
        embeds: [],
        components: [],
        system: false,
        mentions: { users: new Map(), members: new Map() },
        guild: sampleGuild,
    },
    {
        ...bob,
        id: 'm5',
        content: '',
        createdTimestamp: now - 10 * 60 * 1000,
        attachments: new Map(),
        embeds: [
            {
                color: 0x22c55e,
                title: 'Заказ #481 найден',
                url: 'https://example.com/orders/481',
                description: 'Статус: **Возврат средств**\nСумма: 2 500 ₽',
                author: { name: 'DS Market', iconURL: 'https://cdn.discordapp.com/embed/avatars/1.png' },
                footer: { text: 'Обновлено системой' },
                fields: [
                    { name: 'Покупатель', value: 'Алиса', inline: true },
                    { name: 'Товар', value: 'Premium Pass', inline: true },
                ],
            },
        ],
        components: [
            {
                type: 1,
                components: [
                    { type: 2, label: 'Подтвердить возврат', style: 3, disabled: false, emoji: { name: '✅' } },
                    { type: 2, label: 'Открыть жалобу', style: 2, disabled: false },
                    { type: 2, label: 'Сайт', style: 5, url: 'https://example.com' },
                ],
            },
        ],
        system: false,
        mentions: { users: new Map(), members: new Map() },
        guild: sampleGuild,
    },
    {
        ...alice,
        id: 'm6',
        content: 'Спасибо большое! Всё вернули 🥳',
        createdTimestamp: now - 8 * 60 * 1000,
        editedTimestamp: now - 7 * 60 * 1000,
        attachments: new Map(),
        embeds: [],
        components: [],
        system: false,
        mentions: { users: new Map(), members: new Map() },
        guild: sampleGuild,
    },
    {
        ...bob,
        id: 'm7',
        author: { ...bob.author, id: 'SYSTEM' },
        content: '',
        createdTimestamp: now - 5 * 60 * 1000,
        attachments: new Map(),
        embeds: [],
        components: [],
        system: true,
        type: 1,
        mentions: { users: new Map([[alice.author.id, alice.author]]), members: new Map() },
        guild: sampleGuild,
    },
];

async function run() {
    console.log('🧪 Запуск демо-генерации транскрипта...');

    const result = await generateTranscriptFromMessages(messages, {
        guild: sampleGuild,
        channelId: '900000000000000001',
        channelName: 'ticket-00481',
        ticket: {
            ticketId: 481,
            userId: alice.author.id,
            moderatorId: bob.author.id,
            reason: 'Проблема с заказом #481 (DS Market)',
            createdAt: now - 15 * 60 * 1000,
            department: 'DS Market Support',
            status: 'resolved',
        },
        outputDir: require('path').join(__dirname, '..', 'demo_output'),
        saveToFile: true,
        locale: 'ru-RU',
        accentColor: '#60a5fa',
    });

    if (result) {
        console.log('✅ Транскрипт готов!');
        console.log('   Сообщений:', result.messageCount);
        console.log('   Имя файла:', result.fileName);
        console.log('   Путь:', result.filePath);
        console.log('   HTML size:', result.html.length, 'символов');
        console.log('   Buffer size:', result.buffer.length, 'байт');
        console.log('   AttachmentBuilder available:', !!result.attachment);
    } else {
        console.error('❌ Ошибка генерации');
    }

    console.log('\n📚 Пример утилиты escapeHtml:', utils.escapeHtml('<b>тест</b>'));
    console.log('📚 Пример утилиты formatDateTime:', utils.formatDateTime(now, 'ru-RU'));
}

run().catch(console.error);
