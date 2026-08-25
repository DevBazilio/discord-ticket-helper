const fs = require('fs');
const path = require('path');

let djs = null;
try {
    djs = require('discord.js');
} catch (_) {
    djs = null;
}

const COMPONENT_TYPE = Object.freeze({
    Container: 17,
    TextDisplay: 10,
    Separator: 14,
    Section: 9,
    Thumbnail: 11,
    MediaGallery: 12,
    ActionRow: 1,
    Button: 2,
    StringSelect: 3,
    UserSelect: 5,
    RoleSelect: 6,
    MentionableSelect: 7,
    ChannelSelect: 8,
    File: 13,
});

const BUTTON_STYLE = Object.freeze({
    Primary: 1,
    Secondary: 2,
    Success: 3,
    Danger: 4,
    Link: 5,
});

const MESSAGE_TYPE = Object.freeze({
    RecipientAdd: 1,
    RecipientRemove: 2,
});

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function sanitizeUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    try {
        const url = new URL(raw);
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
        return null;
    } catch {
        return null;
    }
}

function hexToRgb(hex) {
    const normalized = String(hex ?? '').trim();
    const match = normalized.match(/^#?([0-9a-fA-F]{6})$/);
    if (!match) return null;
    const value = match[1];
    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
    };
}

function getDiscordEmojiCdnUrl(emojiId, animated = false) {
    if (!emojiId) return null;
    const ext = animated ? 'gif' : 'png';
    return `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=48&quality=lossless`;
}

function getTranscriptButtonStyleClass(style) {
    switch (Number(style)) {
        case Number(BUTTON_STYLE.Primary):
            return 'primary';
        case Number(BUTTON_STYLE.Secondary):
            return 'secondary';
        case Number(BUTTON_STYLE.Success):
            return 'success';
        case Number(BUTTON_STYLE.Danger):
            return 'danger';
        case Number(BUTTON_STYLE.Link):
            return 'link';
        default:
            return 'secondary';
    }
}

function formatTranscriptTimestamp(ms, style, locale = 'ru-RU') {
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return null;
    const timeShort = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
    const timeLong = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
    const dateShort = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
    const dateLong = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    const dateTimeShort = `${dateShort} ${timeShort}`;
    const dateTimeLong = `${dateLong} ${timeShort}`;
    if (style === 't') return timeShort;
    if (style === 'T') return timeLong;
    if (style === 'd') return dateShort;
    if (style === 'D') return dateLong;
    if (style === 'F') return dateTimeLong;
    return dateTimeShort;
}

function formatTranscriptRelativeTime(targetMs, nowMs = Date.now(), locale = 'ru-RU') {
    const deltaMs = targetMs - nowMs;
    const abs = Math.abs(deltaMs);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const month = 30 * day;
    const year = 365 * day;
    if (abs < minute) return rtf.format(Math.round(deltaMs / 1000), 'second');
    if (abs < hour) return rtf.format(Math.round(deltaMs / minute), 'minute');
    if (abs < day) return rtf.format(Math.round(deltaMs / hour), 'hour');
    if (abs < month) return rtf.format(Math.round(deltaMs / day), 'day');
    if (abs < year) return rtf.format(Math.round(deltaMs / month), 'month');
    return rtf.format(Math.round(deltaMs / year), 'year');
}

function formatDateTime(value, locale = 'ru-RU') {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const dd = pad(d.getDate());
    const MM = pad(d.getMonth() + 1);
    const yyyy = String(d.getFullYear());
    return `${hh}:${mm} ${dd}.${MM}.${yyyy}`;
}

function formatTime(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isLikelyImage(attachment) {
    const contentType = attachment?.contentType ?? null;
    if (contentType && String(contentType).toLowerCase().startsWith('image/')) return true;
    const url = attachment?.url ?? '';
    return /\.(png|jpe?g|gif|webp)$/i.test(url);
}

function renderMentionPill(type, id, label, colorHex = null) {
    const normalizedType = String(type ?? '').toLowerCase();
    const prefix = normalizedType === 'channel' ? '#' : '@';
    const rgb = colorHex ? hexToRgb(colorHex) : null;
    const style = rgb
        ? ` style="background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18); border-color: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.36); color: ${escapeHtml(colorHex)};"`
        : '';
    const rawId = String(id ?? '');
    const canCopy = /^\d{17,20}$/.test(rawId);
    const attrs = canCopy
        ? ` class="mention-pill ${escapeHtml(normalizedType)} copy-id" data-copy-id="${escapeHtml(
              rawId
          )}" title="${escapeHtml(`Нажмите, чтобы скопировать ID: ${rawId}`)}" role="button" tabindex="0"`
        : ` class="mention-pill ${escapeHtml(normalizedType)}"`;
    return `<span${attrs}${style}>${escapeHtml(`${prefix}${label ?? 'unknown'}`)}</span>`;
}

function applyDiscordMarkdown(html) {
    const lines = String(html ?? '').split('\n').map((line) => {
        if (line.startsWith('### ')) return `<div class="md-heading h3">${line.slice(4)}</div>`;
        if (line.startsWith('## ')) return `<div class="md-heading h2">${line.slice(3)}</div>`;
        if (line.startsWith('# ')) return `<div class="md-heading h1">${line.slice(2)}</div>`;
        if (line.startsWith('&gt;&gt;&gt; ')) return `<span class="md-quote">${line.slice(13)}</span>`;
        if (line.startsWith('&gt; ')) return `<span class="md-quote">${line.slice(5)}</span>`;
        if (line.startsWith('- ')) return `<div class="md-list-item">• ${line.slice(2)}</div>`;
        if (line.startsWith('* ')) return `<div class="md-list-item">• ${line.slice(2)}</div>`;
        const ordered = line.match(/^(\d{1,3})\.\s+(.*)$/);
        if (ordered) return `<div class="md-list-item">${ordered[1]}. ${ordered[2]}</div>`;
        return line;
    });

    return lines
        .join('\n')
        .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
        .replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer noopener">$2</a>')
        .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__([\s\S]+?)__/g, '<u>$1</u>')
        .replace(/~~([\s\S]+?)~~/g, '<s>$1</s>')
        .replace(/\|\|([\s\S]+?)\|\|/g, '<span class="md-spoiler">$1</span>')
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
}

function prepareMentionPlaceholders(content, message) {
    const guild = message.guild;
    const getMember = (id) => guild?.members?.cache?.get(id) ?? null;
    const getUserMeta = (id) => {
        const member = getMember(id);
        const user = message.mentions?.users?.get?.(id) ?? member?.user ?? null;
        const label = member?.displayName ?? user?.globalName ?? user?.username ?? user?.tag ?? id;
        const color = member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : null;
        return { label, color };
    };
    const getRoleMeta = (id) => {
        const role = guild?.roles?.cache?.get(id) ?? null;
        const label = role?.name ?? id;
        const color = role?.hexColor && role.hexColor !== '#000000' ? role.hexColor : null;
        return { label, color };
    };
    const getChannelMeta = (id) => {
        const channel = guild?.channels?.cache?.get(id) ?? null;
        const label = channel?.name ?? id;
        return { label };
    };

    return String(content ?? '')
        .replace(/@everyone/g, '[[[PING:everyone:everyone]]]')
        .replace(/@here/g, '[[[PING:here:here]]]')
        .replace(/<@!?(\d{17,20})>/g, (_, id) => {
            const meta = getUserMeta(id);
            return meta.color
                ? `[[[USER:${id}:${meta.label}:${meta.color}]]]`
                : `[[[USER:${id}:${meta.label}]]]`;
        })
        .replace(/<@&(\d{17,20})>/g, (_, id) => {
            const meta = getRoleMeta(id);
            return meta.color
                ? `[[[ROLE:${id}:${meta.label}:${meta.color}]]]`
                : `[[[ROLE:${id}:${meta.label}]]]`;
        })
        .replace(/<#(\d{17,20})>/g, (_, id) => {
            const meta = getChannelMeta(id);
            return `[[[CHANNEL:${id}:${meta.label}]]]`;
        });
}

function createRenderDiscordFormattedText(locale = 'ru-RU') {
    return function renderDiscordFormattedText(content, message, fallback = '') {
        const tokens = [];
        const createToken = (html) => {
            const index = tokens.push(html) - 1;
            return `%%TRANSCRIPT_TOKEN_${index}%%`;
        };

        const prepared = prepareMentionPlaceholders(String(content ?? ''), message)
            .replace(/<t:(\d{1,13})(?::([tTdDfFR]))?>/g, (_, raw, style) => {
                const numeric = Number(raw);
                if (!Number.isFinite(numeric)) return _;
                const ms = numeric > 1e12 ? numeric : numeric * 1000;
                const timestampStyle = style || 'f';
                const label =
                    timestampStyle === 'R'
                        ? formatTranscriptRelativeTime(ms, Date.now(), locale)
                        : formatTranscriptTimestamp(ms, timestampStyle, locale);
                const title = formatTranscriptTimestamp(ms, 'f', locale);
                if (!label) return _;
                return createToken(
                    `<time class="md-timestamp" datetime="${escapeHtml(
                        new Date(ms).toISOString()
                    )}" title="${escapeHtml(title ?? '')}">${escapeHtml(label)}</time>`
                );
            })
            .replace(/```([\s\S]*?)```/g, (_, code) =>
                createToken(`<pre class="md-code-block"><code>${escapeHtml(String(code ?? '').trim())}</code></pre>`)
            )
            .replace(/`([^`\n]+)`/g, (_, code) =>
                createToken(`<code class="md-code-inline">${escapeHtml(code)}</code>`)
            )
            .replace(/<a?:[a-zA-Z0-9_]+:\d{17,20}>/g, (part) => {
                const match = String(part).match(/^<(a?):([a-zA-Z0-9_]+):(\d{17,20})>$/);
                const cdnUrl = match ? getDiscordEmojiCdnUrl(match[3], Boolean(match[1])) : null;
                return cdnUrl
                    ? createToken(
                        `<img class="inline-emoji" src="${escapeHtml(cdnUrl)}" alt="${escapeHtml(
                            part
                        )}" loading="lazy" />`
                    )
                    : createToken(escapeHtml(part));
            })
            .replace(
                /\[\[\[(USER|ROLE|CHANNEL|PING):([^:\]]*?):([\s\S]*?)(?::(#[0-9a-fA-F]{6}))?\]\]\]/g,
                (_, type, _id, label, color) =>
                    createToken(renderMentionPill(type, _id, label, color ?? null))
            );

        const html = applyDiscordMarkdown(escapeHtml(prepared))
            .replace(/%%TRANSCRIPT_TOKEN_(\d+)%%/g, (_, index) => tokens[Number(index)] ?? '')
            .replace(/\n/g, '<br />');

        return html || fallback;
    };
}

function renderTranscriptComponentNode(component, message, renderDiscordFormattedText) {
    if (!component || typeof component !== 'object') return '';

    const type = component.type;

    if (type === COMPONENT_TYPE.Container) {
        return `<section class="v2-container">${(component.components ?? [])
            .map((child) => renderTranscriptComponentNode(child, message, renderDiscordFormattedText))
            .join('')}</section>`;
    }

    if (type === COMPONENT_TYPE.TextDisplay) {
        return `<div class="v2-text">${renderDiscordFormattedText(component.content ?? '', message, '')}</div>`;
    }

    if (type === COMPONENT_TYPE.Separator) {
        return '<div class="v2-separator"></div>';
    }

    if (type === COMPONENT_TYPE.Section) {
        const accessory = component.accessory
            ? renderTranscriptComponentNode(component.accessory, message, renderDiscordFormattedText)
            : '';
        return `<section class="v2-section">
  <div class="v2-section-main">${(component.components ?? [])
            .map((child) => renderTranscriptComponentNode(child, message, renderDiscordFormattedText))
            .join('')}</div>
  ${accessory ? `<div class="v2-section-accessory">${accessory}</div>` : ''}
</section>`;
    }

    if (type === COMPONENT_TYPE.Thumbnail) {
        const url =
            component.media?.url ??
            component.media?.renderUrl ??
            component.media?.proxy_url ??
            component.media?.proxyUrl ??
            null;
        return url
            ? `<img class="v2-thumbnail" src="${escapeHtml(url)}" alt="${escapeHtml(component.description ?? 'thumbnail')}" loading="lazy" />`
            : '';
    }

    if (type === COMPONENT_TYPE.MediaGallery) {
        const items = Array.isArray(component.items) ? component.items : [];
        return `<div class="v2-gallery">${items
            .map((item) => {
                const url =
                    item?.media?.url ??
                    item?.media?.renderUrl ??
                    item?.media?.proxy_url ??
                    item?.media?.proxyUrl ??
                    null;
                if (!url) return '';
                const caption = item.description
                    ? `<figcaption>${renderDiscordFormattedText(item.description, message, '')}</figcaption>`
                    : '';
                return `<figure class="v2-gallery-item">
  <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">
    <img src="${escapeHtml(url)}" alt="${escapeHtml(item.description ?? 'gallery image')}" loading="lazy" />
  </a>
  ${caption}
</figure>`;
            })
            .join('')}</div>`;
    }

    if (type === COMPONENT_TYPE.ActionRow) {
        return `<div class="v2-action-row">${(component.components ?? [])
            .map((child) => renderTranscriptComponentNode(child, message, renderDiscordFormattedText))
            .join('')}</div>`;
    }

    if (type === COMPONENT_TYPE.Button) {
        const emojiHtml = component.emoji?.id
            ? `<img class="inline-emoji" src="${escapeHtml(
                getDiscordEmojiCdnUrl(component.emoji.id, Boolean(component.emoji.animated))
            )}" alt="${escapeHtml(component.emoji.name ?? 'emoji')}" loading="lazy" />`
            : component.emoji?.name
                ? `<span class="v2-button-emoji">${escapeHtml(component.emoji.name)}</span>`
                : '';

        if (Number(component.style) === Number(BUTTON_STYLE.Link) && component.url) {
            return `<a class="v2-button link ${component.disabled ? 'disabled' : ''}" href="${escapeHtml(
                component.url
            )}" target="_blank" rel="noreferrer noopener">${emojiHtml}${component.label
                ? renderDiscordFormattedText(component.label, message, '')
                : escapeHtml(component.url)}</a>`;
        }

        return `<span class="v2-button ${getTranscriptButtonStyleClass(component.style)} ${component.disabled ? 'disabled' : ''}">${emojiHtml}${component.label
            ? renderDiscordFormattedText(component.label, message, '')
            : 'Button'}</span>`;
    }

    if (type === COMPONENT_TYPE.StringSelect) {
        const placeholder = component.placeholder ?? 'Select menu';
        const options = Array.isArray(component.options) ? component.options : [];
        const preview = options.slice(0, 6);
        const tail = options.length > preview.length ? `+${options.length - preview.length}` : null;
        const optionsHtml = preview.length
            ? `<div class="v2-select-options">${preview
                .map((option) => {
                    const desc = option.description
                        ? `<span class="v2-select-option-desc">${renderDiscordFormattedText(
                            option.description,
                            message,
                            ''
                        )}</span>`
                        : '';
                    return `<div class="v2-select-option">
  <span class="v2-select-option-label">${renderDiscordFormattedText(
                        option.label ?? option.value ?? 'option',
                        message,
                        ''
                    )}</span>
  ${desc}
</div>`;
                })
                .join('')}${tail ? `<div class="v2-select-more">… ${escapeHtml(tail)} вариантов</div>` : ''}</div>`
            : '';

        return `<div class="v2-select">
  <div class="v2-select-head">${renderDiscordFormattedText(placeholder, message, '')}</div>
  ${optionsHtml}
</div>`;
    }

    if (
        type === COMPONENT_TYPE.UserSelect ||
        type === COMPONENT_TYPE.RoleSelect ||
        type === COMPONENT_TYPE.MentionableSelect ||
        type === COMPONENT_TYPE.ChannelSelect
    ) {
        return `<div class="v2-select"><div class="v2-select-head">${renderDiscordFormattedText(
            component.placeholder ?? 'Select menu',
            message,
            ''
        )}</div></div>`;
    }

    if (type === COMPONENT_TYPE.File) {
        return component.name
            ? `<div class="v2-file">${renderDiscordFormattedText(component.name, message, '')}</div>`
            : '<div class="v2-file">File</div>';
    }

    return '';
}

function renderTranscriptComponents(message, renderDiscordFormattedText) {
    const components = Array.isArray(message.components) ? message.components : [];
    if (!components.length) return '';
    const html = components.map((c) => renderTranscriptComponentNode(c, message, renderDiscordFormattedText)).join('');
    if (!html.trim()) return '';
    return `<div class="v2-components">${html}</div>`;
}

function getMessageText(message) {
    const raw = message.content?.trim?.() || '';
    if (raw) return raw;

    const sys = message.systemContent?.trim?.() || message.cleanContent?.trim?.() || '';
    if (sys) return sys;

    if (!message.system) return '';

    const type = message.type;
    const actor =
        message.member?.displayName ??
        message.author?.globalName ??
        message.author?.username ??
        'Unknown';

    const getTargetLabel = (user) => {
        const member = message.guild?.members?.cache?.get(user.id) ?? null;
        return (
            member?.displayName ??
            user.globalName ??
            user.username ??
            user.tag ??
            'Unknown'
        );
    };

    const targets = message.mentions?.users?.size
        ? [...message.mentions.users.values()].map(getTargetLabel)
        : message.mentions?.members?.size
            ? [...message.mentions.members.values()].map((member) => member.displayName)
            : [];
    const targetsText = targets.length ? targets.join(', ') : null;

    if (type === MESSAGE_TYPE.RecipientAdd) {
        return targetsText
            ? `${actor} добавляет ${targetsText} в ветку.`
            : `${actor} добавляет пользователя в ветку.`;
    }

    if (type === MESSAGE_TYPE.RecipientRemove) {
        return targetsText
            ? `${actor} удаляет ${targetsText} из ветки.`
            : `${actor} удаляет пользователя из ветки.`;
    }

    const typeName = djs
        ? (Object.entries(djs.MessageType).find(([, v]) => v === type)?.[0] ?? null)
        : null;
    return typeName ? `System: ${typeName}` : 'System message';
}

function groupMessages(messages) {
    const groups = [];
    for (const message of messages) {
        const authorId = message.author?.id ?? null;
        const createdAtMs = Number(message.createdTimestamp ?? 0);
        const canGroup = Boolean(authorId && createdAtMs);

        const prev = groups.length ? groups[groups.length - 1] : null;
        if (
            canGroup &&
            prev?.canGroup &&
            prev.authorId === authorId &&
            Number.isFinite(prev.lastCreatedAtMs) &&
            createdAtMs - prev.lastCreatedAtMs <= 60000
        ) {
            prev.parts.push(message);
            prev.lastCreatedAtMs = createdAtMs;
            continue;
        }

        groups.push({
            canGroup,
            authorId,
            lastCreatedAtMs: createdAtMs || 0,
            parts: [message],
        });
    }
    return groups;
}

function renderEmbeds(message, renderDiscordFormattedText) {
    const rawEmbeds = Array.isArray(message.embeds) ? message.embeds : [];
    const embeds = rawEmbeds.map((embed) =>
        embed && typeof embed.toJSON === 'function' ? embed.toJSON() : embed
    );
    if (!embeds.length) return '';

    const normalizeColor = (color) => {
        const num = Number(color);
        if (!Number.isFinite(num) || num <= 0) return '#5865f2';
        return `#${num.toString(16).padStart(6, '0')}`;
    };

    const renderField = (field) => {
        const name = escapeHtml(field?.name ?? '');
        const value = renderDiscordFormattedText(field?.value ?? '', message, '');
        const inline = field?.inline ? 'inline' : '';
        return `<div class="embed-field ${inline}"><strong>${name}</strong><div>${value || '—'}</div></div>`;
    };

    return `<div class="embeds">${embeds
        .map((embed) => {
            const color = normalizeColor(embed?.color);
            const authorName = embed?.author?.name ?? '';
            const authorIcon = embed?.author?.iconURL ?? embed?.author?.icon_url ?? '';
            const title = embed?.title ?? '';
            const url = embed?.url ?? '';
            const description = (embed?.description ?? '').trim();
            const descHtml = renderDiscordFormattedText(description, message, '');
            const footerText = embed?.footer?.text ?? '';
            const footerIcon = embed?.footer?.iconURL ?? embed?.footer?.icon_url ?? '';
            const thumb = embed?.thumbnail?.url ?? '';
            const image = embed?.image?.url ?? '';
            const fields = Array.isArray(embed?.fields) ? embed.fields : [];

            const titleHtml = title
                ? url
                    ? `<a class="embed-title" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(title)}</a>`
                    : `<div class="embed-title">${escapeHtml(title)}</div>`
                : '';

            const authorHtml = authorName
                ? `<div class="embed-author">${authorIcon ? `<img src="${escapeHtml(authorIcon)}" alt="" />` : ''}<span>${escapeHtml(authorName)}</span></div>`
                : '';

            const footerHtml = footerText
                ? `<div class="embed-footer">${footerIcon ? `<img src="${escapeHtml(footerIcon)}" alt="" />` : ''}<span>${escapeHtml(footerText)}</span></div>`
                : '';

            const thumbHtml = thumb ? `<div class="embed-thumb"><img src="${escapeHtml(thumb)}" alt="" /></div>` : '';
            const imageHtml = image ? `<div class="embed-image"><img src="${escapeHtml(image)}" alt="" /></div>` : '';

            const fieldsHtml = fields.length
                ? `<div class="embed-fields">${fields.map(renderField).join('')}</div>`
                : '';

            const descBlock = descHtml ? `<div class="embed-description">${descHtml}</div>` : '';

            return `<div class="embed-card" style="--embed-accent:${escapeHtml(color)}">
  ${authorHtml}
  ${titleHtml}
  ${descBlock}
  ${fieldsHtml}
  ${thumbHtml}
  ${imageHtml}
  ${footerHtml}
</div>`;
        })
        .join('')}</div>`;
}

function renderPart(message, showPartTime, renderDiscordFormattedText, locale = 'ru-RU') {
    const member = message.member ?? null;
    const authorId = message.author?.id ?? null;
    const avatarUrl =
        member?.displayAvatarURL?.({ extension: 'png', size: 128 }) ??
        message.author?.displayAvatarURL?.({ extension: 'png', size: 128 }) ??
        'https://cdn.discordapp.com/embed/avatars/0.png';
    const accentColor =
        member?.displayHexColor && member.displayHexColor !== '#000000'
            ? member.displayHexColor
            : '#60a5fa';
    const displayName =
        member?.displayName ??
        message.author?.globalName ??
        message.author?.username ??
        'Unknown';
    const tag = message.author?.tag ?? '';
    const createdAt = formatDateTime(message.createdTimestamp, locale) ?? '';
    const editedAt = formatDateTime(message.editedTimestamp, locale);
    const contentRaw = getMessageText(message);
    const contentText =
        message.system && contentRaw
            ? `${contentRaw} — ${formatTime(message.createdTimestamp) ?? createdAt}`
            : contentRaw;
    const content = renderDiscordFormattedText(contentText, message, '');

    const attachmentItems = [...(message.attachments?.values?.() ?? [])].map((att) => {
        const name = att.name ?? 'file';
        const url = att.url;
        if (isLikelyImage(att)) {
            return `<figure class="gallery-item"><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener"><img src="${escapeHtml(
                url
            )}" alt="${escapeHtml(name)}" /></a><figcaption>${escapeHtml(name)}</figcaption></figure>`;
        }
        return `<div class="attachment"><div class="attachment-meta"><a href="${escapeHtml(
            url
        )}" target="_blank" rel="noreferrer noopener">${escapeHtml(name)}</a><span>${escapeHtml(
            String(att.size ?? '')
        )}</span></div></div>`;
    });

    const gallery = attachmentItems.length
        ? `<div class="${attachmentItems.some((x) => x.includes('gallery-item')) ? 'gallery-grid' : 'attachments'}">${attachmentItems.join(
              ''
          )}</div>`
        : '';

    const flags = editedAt ? `<span class="message-flag edited">изменено ${escapeHtml(editedAt)}</span>` : '';

    const partHeader = showPartTime ? `<div class="message-part-time">${escapeHtml(createdAt)}</div>` : '';
    const embedsHtml = renderEmbeds(message, renderDiscordFormattedText);
    const componentsHtml = renderTranscriptComponents(message, renderDiscordFormattedText);
    const hasBody = Boolean(content || embedsHtml || componentsHtml || gallery);

    return {
        authorId,
        avatarUrl,
        accentColor,
        displayName,
        tag,
        createdAt,
        isSystem: Boolean(message.system),
        html: `<div class="message-part">
  ${partHeader}
  <div class="message-flags">${flags}</div>
  ${content ? `<div class="content">${content}</div>` : ''}
  ${embedsHtml}
  ${componentsHtml}
  ${!hasBody ? `<div class="content"><span class="author-meta">—</span></div>` : ''}
  ${gallery}
</div>`,
    };
}

function buildCss(accentColor = '#60a5fa') {
    return `
    :root { color-scheme: dark; --brand-accent:${accentColor}; }
    @keyframes bgShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
    body { font-family: Arial, sans-serif; background:linear-gradient(135deg, #0b1020, #0b132a, #0b1020); background-size: 220% 220%; animation: bgShift 14s ease infinite; color:#f3f4f6; margin:0; padding:24px; }
    .wrap { max-width: 1100px; margin: 0 auto; }
    .hero { position:relative; overflow:hidden; background:linear-gradient(135deg, color-mix(in srgb, var(--brand-accent) 36%, transparent), rgba(17,24,39,.95)); border:1px solid #334155; border-radius:18px; margin-bottom:18px; }
    .hero-banner { height:140px; background:linear-gradient(135deg, #1d4ed8, #0f172a); opacity:.45; }
    .hero-body { position:relative; margin-top:-56px; padding:0 20px 20px; }
    .hero-head { display:flex; align-items:center; gap:16px; }
    @keyframes floatBob { 0% { transform: translateY(0); } 50% { transform: translateY(-3px); } 100% { transform: translateY(0); } }
    @keyframes borderGlow { 0% { box-shadow: 0 0 0 rgba(96,165,250,0); } 50% { box-shadow: 0 0 0 10px rgba(96,165,250,.08); } 100% { box-shadow: 0 0 0 rgba(96,165,250,0); } }
    .guild-icon { width:84px; height:84px; border-radius:24px; object-fit:cover; border:4px solid rgba(11,16,32,.92); background:#111827; animation: floatBob 3.8s ease-in-out infinite; }
    .hero:hover .guild-icon { animation: floatBob 2.8s ease-in-out infinite, borderGlow 2.4s ease-in-out infinite; }
    .hero-title { display:flex; flex-direction:column; gap:6px; }
    .eyebrow { color:var(--brand-accent); text-transform:uppercase; letter-spacing:.12em; font-size:12px; }
    .title { font-size:28px; font-weight:700; }
    .subtitle { color:#cbd5e1; font-size:14px; }
    .card { background:#111827; border:1px solid #334155; border-radius:14px; padding:16px; margin-bottom:16px; box-shadow:0 10px 30px rgba(0,0,0,.18); }
    .stat { transition: transform .14s ease, border-color .14s ease, box-shadow .14s ease; }
    .stat:hover { transform: translateY(-1px); border-color: rgba(96,165,250,.35); box-shadow: 0 10px 24px rgba(0,0,0,.20); }
    .grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px 16px; }
    .stat { padding:10px 12px; border-radius:10px; background:rgba(255,255,255,.02); border:1px solid #1f2937; overflow-wrap:anywhere; word-break:break-word; }
    .stat strong { display:block; color:#93c5fd; margin-bottom:4px; font-size:12px; text-transform:uppercase; letter-spacing:.06em; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(10px) scale(.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .message { display:flex; gap:14px; background:linear-gradient(180deg, #0f172a, #111827); border:1px solid #334155; border-left:4px solid var(--accent, #60a5fa); border-radius:12px; padding:14px; margin-bottom:14px; box-shadow:0 8px 24px rgba(0,0,0,.18); }
    .message, .embed-card { animation: fadeUp .22s ease both; }
    .message { position:relative; }
    .message:hover { transform: translateY(-1px); transition: transform .14s ease; }
    .message.is-system { border-left-color:#a78bfa; }
    .avatar-wrap { flex:0 0 48px; }
    .avatar { width:48px; height:48px; border-radius:50%; object-fit:cover; border:2px solid rgba(255,255,255,.08); transition: transform .18s ease, filter .18s ease; }
    .message:hover .avatar { transform: translateY(-1px) scale(1.03); filter: brightness(1.05); }
    .body { min-width:0; flex:1; }
    .meta { display:flex; justify-content:space-between; gap:12px; margin-bottom:8px; font-size:12px; align-items:flex-start; }
    .meta-side { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
    .author-line { display:flex; flex-direction:column; gap:2px; }
    .display-name { color:var(--accent, #93c5fd); font-size:14px; }
    .author-meta, .time { color:#94a3b8; }
    .message-part { margin-top:10px; padding-top:10px; border-top:1px solid rgba(51,65,85,.7); }
    .message-part:first-of-type { margin-top:0; padding-top:0; border-top:0; }
    .message-part { animation: fadeUp .18s ease both; }
    .message .message-part:nth-of-type(1) { animation-delay: 0ms; }
    .message .message-part:nth-of-type(2) { animation-delay: 20ms; }
    .message .message-part:nth-of-type(3) { animation-delay: 40ms; }
    .message .message-part:nth-of-type(4) { animation-delay: 60ms; }
    .message .message-part:nth-of-type(5) { animation-delay: 80ms; }
    .message .message-part:nth-of-type(6) { animation-delay: 100ms; }
    .message-part-time { display:flex; justify-content:flex-end; font-size:11px; color:#64748b; margin-bottom:6px; }
    .content { white-space:normal; word-break:break-word; margin:0; color:#e5e7eb; background:rgba(255,255,255,.02); border-radius:8px; padding:10px; line-height:1.55; }
    .message-flags { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
    .message-flag { display:inline-flex; align-items:center; font-size:11px; border-radius:999px; padding:3px 8px; border:1px solid transparent; text-transform:uppercase; letter-spacing:.04em; }
    .message-flag.edited { color:#fcd34d; background:rgba(250,204,21,.14); border-color:rgba(250,204,21,.24); }
    .md-code-inline { font-family: Consolas, monospace; font-size:.95em; background:rgba(15,23,42,.9); border:1px solid #334155; border-radius:6px; padding:2px 6px; color:#f8fafc; }
    .md-code-block { margin:8px 0; padding:12px; overflow:auto; background:#020617; border:1px solid #334155; border-radius:10px; }
    .md-code-block code { font-family: Consolas, monospace; color:#e2e8f0; white-space:pre; }
    .md-heading { display:block; margin:8px 0 6px; font-weight:800; color:#f8fafc; }
    .md-heading.h1 { font-size:18px; }
    .md-heading.h2 { font-size:16px; opacity:.98; }
    .md-heading.h3 { font-size:14px; opacity:.98; }
    .md-list-item { display:block; margin:2px 0; padding-left:8px; }
    .md-quote { display:block; margin:4px 0; padding:8px 12px; border-left:3px solid #60a5fa; background:rgba(37,99,235,.08); color:#dbeafe; }
    .md-spoiler { background:#94a3b8; color:transparent; border-radius:4px; padding:0 4px; }
    .md-spoiler { transition: color .18s ease, background-color .18s ease; }
    .md-spoiler:hover { color:#0f172a; background:#cbd5e1; }
    .md-timestamp { display:inline-flex; align-items:center; padding:1px 6px; border-radius:6px; font-weight:600; background:rgba(148,163,184,.12); border:1px solid rgba(148,163,184,.22); color:#e2e8f0; }
    .md-timestamp { transition: transform .14s ease, background-color .14s ease, border-color .14s ease; }
    .md-timestamp:hover { transform: translateY(-1px); background:rgba(96,165,250,.12); border-color: rgba(96,165,250,.28); }
    .inline-emoji { width:22px; height:22px; vertical-align:middle; object-fit:contain; }
    .mention-pill { display:inline-flex; align-items:center; padding:1px 6px; border-radius:6px; font-weight:600; background:rgba(88,101,242,.22); color:#c4d4ff; border:1px solid rgba(88,101,242,.28); }
    .mention-pill.role, .mention-pill.ping { background:rgba(244,114,182,.16); color:#f9a8d4; border-color:rgba(244,114,182,.28); }
    .mention-pill.channel { background:rgba(56,189,248,.14); color:#bae6fd; border-color:rgba(56,189,248,.24); }
    .copy-id { cursor:pointer; user-select:none; }
    .copy-id:focus { outline:2px solid rgba(96,165,250,.45); outline-offset:2px; border-radius:8px; }
    @keyframes glowPulse { 0% { box-shadow: 0 0 0 rgba(96,165,250,0); } 50% { box-shadow: 0 0 0 6px rgba(96,165,250,.10); } 100% { box-shadow: 0 0 0 rgba(96,165,250,0); } }
    .display-name.copy-id:hover, .mention-pill.copy-id:hover { filter: brightness(1.08); transform: translateY(-1px) scale(1.02); transition: transform .14s ease, filter .14s ease; animation: glowPulse .8s ease infinite; }
    @keyframes copiedPop { 0% { transform: scale(1); } 35% { transform: scale(1.06); } 100% { transform: scale(1); } }
    .copied { animation: copiedPop .22s ease both; }
    .toast-wrap { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 9999; pointer-events:none; }
    .toast { position:relative; overflow:hidden; pointer-events:none; background: rgba(2,6,23,.92); border: 1px solid rgba(51,65,85,.9); color:#e5e7eb; padding: 10px 12px; border-radius: 12px; box-shadow: 0 18px 40px rgba(0,0,0,.35); min-width: 220px; max-width: min(520px, calc(100vw - 36px)); text-align:center; opacity:0; transform: translateY(10px) scale(.98); transition: opacity .16s ease, transform .16s ease; }
    .toast-text { display:block; padding-bottom:3px; }
    .toast-bar { position:absolute; left:0; right:0; bottom:0; height:3px; background: linear-gradient(90deg, #60a5fa, #a78bfa, #f472b6); transform-origin:left; transform: scaleX(0); opacity:.85; }
    .toast.show { opacity:1; transform: translateY(0) scale(1); }
    .toast.show .toast-bar { animation: toastBar 1.4s linear both; }
    @keyframes toastBar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    @keyframes shimmer { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
    .hero-banner { background-size: 200% 200%; animation: shimmer 8s ease infinite; }
    .title { position:relative; }
    .title::after { content:''; position:absolute; left:0; bottom:-6px; height:2px; width:58%; border-radius:999px; background: linear-gradient(90deg, rgba(96,165,250,.0), rgba(96,165,250,.65), rgba(167,139,250,.55), rgba(244,114,182,.0)); background-size: 200% 100%; animation: shimmer 6.5s ease infinite; opacity:.75; }
    .message { transition: transform .14s ease, box-shadow .14s ease; }
    .message:hover { box-shadow:0 14px 36px rgba(0,0,0,.26); }
    .card { animation: fadeUp .22s ease both; }
    .card:hover { transform: translateY(-1px); transition: transform .14s ease, box-shadow .14s ease; box-shadow:0 14px 36px rgba(0,0,0,.22); }
    .gallery-item img, .v2-gallery-item img { transition: transform .18s ease, filter .18s ease; }
    .gallery-item:hover img, .v2-gallery-item:hover img { transform: scale(1.03); filter: brightness(1.04); }
    .v2-button { transition: transform .12s ease, filter .12s ease; }
    .v2-button:hover { filter: brightness(1.06); transform: translateY(-1px); }
    .v2-button:active { transform: translateY(0) scale(.98); }
    @media (prefers-reduced-motion: reduce) {
      .message, .embed-card, .copied { animation: none !important; }
      .toast { transition: none !important; }
      .hero-banner { animation: none !important; }
      .title::after { animation: none !important; }
      .display-name.copy-id:hover, .mention-pill.copy-id:hover { transform: none !important; }
      .toast.show .toast-bar { animation: none !important; }
      .card { animation: none !important; }
      .gallery-item img, .v2-gallery-item img, .v2-button { transition: none !important; }
      body { animation: none !important; }
      .stat, .md-timestamp, .md-spoiler { transition: none !important; }
      .guild-icon, .hero:hover .guild-icon { animation: none !important; }
      .message-part { animation: none !important; }
      .v2-container:hover { animation: none !important; }
      .attachment, .gallery-item, .v2-gallery-item { transition: none !important; }
    }
    html { scrollbar-width: thin; scrollbar-color: rgba(96,165,250,.55) rgba(15,23,42,.85); }
    ::-webkit-scrollbar { width: 12px; height: 12px; }
    ::-webkit-scrollbar-track { background: rgba(15,23,42,.85); border-radius: 999px; }
    ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(96,165,250,.55), rgba(167,139,250,.55)); border: 3px solid rgba(15,23,42,.85); border-radius: 999px; }
    ::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(96,165,250,.72), rgba(244,114,182,.62)); }
    ::-webkit-scrollbar-thumb:hover { box-shadow: 0 0 0 3px rgba(96,165,250,.10) inset; }
    .content a, .embed-card a { color:#93c5fd; text-decoration:none; background: linear-gradient(currentColor, currentColor); background-size: 0% 2px; background-repeat: no-repeat; background-position: 0 100%; transition: background-size .18s ease; }
    .content a:hover, .embed-card a:hover { background-size: 100% 2px; }
    .attachments { margin-top:10px; display:grid; gap:10px; }
    .attachment { background:rgba(255,255,255,.03); border:1px solid #334155; border-radius:8px; padding:10px; }
    .attachment, .gallery-item, .v2-gallery-item { transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease; }
    .attachment:hover { transform: translateY(-1px); border-color: rgba(96,165,250,.28); box-shadow: 0 14px 30px rgba(0,0,0,.22); }
    .gallery-item:hover, .v2-gallery-item:hover { transform: translateY(-1px); box-shadow: 0 14px 30px rgba(0,0,0,.22); border-color: rgba(96,165,250,.22); }
    .attachment-meta { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
    .gallery-grid { margin-top:10px; display:grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap:10px; }
    .gallery-item { margin:0; background:rgba(255,255,255,.03); border:1px solid #334155; border-radius:10px; overflow:hidden; }
    .gallery-item a { display:block; }
    .gallery-item img { display:block; width:100%; height:180px; object-fit:cover; background:#020617; }
    .gallery-item figcaption { padding:8px 10px; color:#cbd5e1; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .embeds { margin-top:10px; display:grid; gap:10px; }
    .embed-card { position:relative; background:rgba(255,255,255,.03); border:1px solid #334155; border-left:4px solid var(--embed-accent, #5865f2); border-radius:10px; padding:12px; display:grid; gap:10px; }
    .embed-author, .embed-footer { display:flex; align-items:center; gap:8px; color:#cbd5e1; font-size:12px; }
    .embed-author img, .embed-footer img { width:20px; height:20px; border-radius:50%; object-fit:cover; }
    .embed-title { color:#93c5fd; font-weight:700; text-decoration:none; font-size:16px; }
    .embed-description { white-space:pre-wrap; color:#e5e7eb; line-height:1.45; }
    .embed-fields { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:8px; }
    .embed-field { background:rgba(15,23,42,.65); border:1px solid #334155; border-radius:8px; padding:8px; }
    .embed-field.inline { min-height:70px; }
    .embed-field strong { display:block; margin-bottom:4px; color:#f8fafc; }
    .embed-thumb img, .embed-image img { max-width:100%; border-radius:8px; border:1px solid #334155; }
    .embed-thumb img { max-height:180px; object-fit:cover; }
    .v2-components { margin-top:10px; display:grid; gap:10px; }
    @keyframes v2Pulse { 0% { border-left-color:#5865f2; } 50% { border-left-color:#a78bfa; } 100% { border-left-color:#5865f2; } }
    .v2-container { display:grid; gap:10px; padding:12px; border:1px solid #334155; border-left:4px solid #5865f2; border-radius:10px; background:rgba(88,101,242,.06); }
    .v2-container:hover { animation: v2Pulse 2.2s ease-in-out infinite; }
    .v2-text { color:#e5e7eb; white-space:pre-wrap; line-height:1.55; }
    .v2-separator { height:1px; background:#334155; margin:2px 0; }
    .v2-section { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; background:rgba(15,23,42,.45); border:1px solid #334155; border-radius:10px; padding:10px; }
    .v2-section-main { flex:1; display:grid; gap:8px; min-width:0; }
    .v2-section-accessory { flex:0 0 auto; }
    .v2-thumbnail { width:80px; height:80px; border-radius:12px; object-fit:cover; border:1px solid #334155; }
    .v2-gallery { display:grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap:10px; }
    .v2-gallery-item { margin:0; background:rgba(255,255,255,.03); border:1px solid #334155; border-radius:10px; overflow:hidden; }
    .v2-gallery-item img { display:block; width:100%; height:180px; object-fit:cover; background:#020617; }
    .v2-gallery-item figcaption { padding:8px 10px; color:#cbd5e1; font-size:12px; }
    .v2-action-row { display:flex; gap:8px; flex-wrap:wrap; }
    .v2-button, .v2-file { display:inline-flex; align-items:center; gap:6px; padding:8px 12px; border-radius:8px; border:1px solid #334155; background:rgba(255,255,255,.04); color:#e5e7eb; font-size:13px; text-decoration:none; }
    .v2-select { display:block; width:100%; border-radius:8px; border:1px solid #334155; background:rgba(255,255,255,.04); color:#e5e7eb; font-size:13px; overflow:hidden; }
    .v2-select-head { padding:8px 12px; opacity:.95; }
    .v2-select-options { display:grid; gap:8px; padding:10px 12px 12px; border-top:1px solid #334155; background:rgba(2,6,23,.25); }
    .v2-select-option { display:grid; gap:2px; padding:8px 10px; border:1px solid rgba(51,65,85,.7); border-radius:8px; background:rgba(15,23,42,.45); }
    .v2-select-option-label { font-weight:700; color:#f8fafc; }
    .v2-select-option-desc { color:#cbd5e1; font-size:12px; }
    .v2-select-more { color:#94a3b8; font-size:12px; padding:0 2px; }
    .v2-button-emoji { display:inline-flex; align-items:center; }
    .v2-button.primary { background:#5865f2; border-color:#5865f2; color:#fff; }
    .v2-button.secondary { background:#4b5563; border-color:#4b5563; color:#fff; }
    .v2-button.success { background:#22c55e; border-color:#22c55e; color:#052e16; }
    .v2-button.danger { background:#ef4444; border-color:#ef4444; color:#fff; }
    .v2-button.link { background:#2563eb; border-color:#2563eb; color:#fff; }
    .v2-button.disabled { opacity:.55; }
    .transcript-footer { display:flex; justify-content:space-between; gap:12px; align-items:center; color:#94a3b8; font-size:12px; padding:12px 4px 24px; }
    `;
}

function buildClipboardScript() {
    return `
  <div class="toast-wrap"><div id="toast" class="toast" role="status" aria-live="polite"><span class="toast-text"></span><span class="toast-bar"></span></div></div>
  <script>
    (() => {
      const toast = document.getElementById('toast');
      const toastText = toast ? toast.querySelector('.toast-text') : null;
      let toastTimer = null;

      const showToast = (text) => {
        if (!toast) return;
        if (toastText) toastText.textContent = String(text || '');
        else toast.textContent = String(text || '');
        toast.classList.remove('show');
        void toast.offsetWidth;
        toast.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
      };

      const fallbackCopy = (text) => {
        const ta = document.createElement('textarea');
        ta.value = String(text || '');
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      };

      const copyToClipboard = async (text) => {
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
          }
        } catch (_) {}
        try {
          return fallbackCopy(text);
        } catch (_) {
          return false;
        }
      };

      const handleCopy = async (el) => {
        const id = el?.getAttribute?.('data-copy-id');
        if (!id) return;
        const ok = await copyToClipboard(id);
        try {
          el.classList.add('copied');
          setTimeout(() => el.classList.remove('copied'), 240);
        } catch (_) {}
        showToast(ok ? ('ID скопирован: ' + id) : ('ID: ' + id));
      };

      document.addEventListener('click', (e) => {
        const el = e.target?.closest?.('[data-copy-id]');
        if (!el) return;
        e.preventDefault();
        handleCopy(el);
      });

      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = document.activeElement;
        if (!el || !el.getAttribute || !el.getAttribute('data-copy-id')) return;
        e.preventDefault();
        handleCopy(el);
      });
    })();
  </script>`;
}

async function fetchAllMessages(channel, limit = -1) {
    const all = [];
    let before = null;
    while (true) {
        const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
        if (!batch || !batch.size) break;
        all.push(...batch.values());
        before = batch.last().id;
        if (batch.size < 100) break;
        if (limit > 0 && all.length >= limit) break;
    }
    all.sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0));
    if (limit > 0) return all.slice(-limit);
    return all;
}

async function generateTranscript(channel, options = {}) {
    try {
        const {
            ticket = null,
            outputDir = null,
            saveToFile = true,
            locale = 'ru-RU',
            accentColor = '#60a5fa',
            footerText = null,
            title = null,
            messages: providedMessages = null,
            messageLimit = -1,
        } = options;

        const renderDiscordFormattedText = createRenderDiscordFormattedText(locale);

        const messages = Array.isArray(providedMessages)
            ? [...providedMessages].sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0))
            : await fetchAllMessages(channel, messageLimit);

        const guildName = channel.guild?.name ?? 'Unknown';
        const guildIconUrl = channel.guild?.iconURL?.({ extension: 'png', size: 256 }) ?? null;
        const channelName = ticket?.ticketId ?? ticket?.ticketNumber ?? channel.name ?? channel.id ?? 'unknown';
        const channelId = channel.id ?? 'unknown';
        const htmlFileName = title
            ? `${title}-${channelId}.html`
            : ticket?.ticketId
                ? `transcript-ticket-${ticket.ticketId}-${channelId}.html`
                : `transcript-${channelId}.html`;

        const messageGroups = groupMessages(messages);
        const messageBlocks = messageGroups.length
            ? messageGroups
                  .map((group) => {
                      const firstMeta = renderPart(group.parts[0], false, renderDiscordFormattedText, locale);
                      const partHtml = group.parts
                          .map((part, idx) => renderPart(part, group.canGroup && idx > 0, renderDiscordFormattedText, locale).html)
                          .join('\n');
                      const canCopyAuthorId = /^\d{17,20}$/.test(String(firstMeta.authorId ?? ''));
                      const authorAttrs = canCopyAuthorId
                          ? ` data-copy-id="${escapeHtml(String(firstMeta.authorId))}" title="${escapeHtml(
                                `Нажмите, чтобы скопировать ID: ${String(firstMeta.authorId)}`
                            )}" role="button" tabindex="0"`
                          : '';
                      const sysClass = firstMeta.isSystem ? 'is-system' : '';

                      return `<article class="message ${sysClass}" style="--accent:${escapeHtml(firstMeta.accentColor)}">
  <div class="avatar-wrap"><img class="avatar" src="${escapeHtml(firstMeta.avatarUrl)}" alt="${escapeHtml(firstMeta.displayName)}"/></div>
  <div class="body">
    <div class="meta">
      <div class="author-line">
        <div class="display-name${canCopyAuthorId ? ' copy-id' : ''}"${authorAttrs}>${escapeHtml(firstMeta.displayName)}</div>
        <div class="author-meta">${escapeHtml(firstMeta.tag)}</div>
      </div>
      <div class="meta-side">
        <div class="time">${escapeHtml(firstMeta.createdAt)}</div>
      </div>
    </div>
    ${partHtml}
  </div>
</article>`;
                  })
                  .join('\n')
            : '<p>Сообщения отсутствуют.</p>';

        const ticketReason = ticket?.reason ?? ticket?.description ?? 'не указана';
        const createdAt = formatDateTime(ticket?.createdAt ?? ticket?.createdTimestamp ?? null, locale) ?? '';
        const exportedAt = formatDateTime(Date.now(), locale) ?? '';
        const displayTitle = title ?? (ticket?.ticketId ? `Ticket #${ticket.ticketId}` : `Channel #${channelName}`);
        const footerDisplay = footerText ?? `Exported ${exportedAt}`;

        const html = `<!doctype html>
<html lang="${locale.split('-')[0] || 'ru'}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(guildName)} - ${escapeHtml(displayTitle)}</title>
  <style>${buildCss(accentColor)}</style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="hero-banner"></div>
      <div class="hero-body">
        <div class="hero-head">
          ${guildIconUrl ? `<img class="guild-icon" src="${escapeHtml(guildIconUrl)}" alt="${escapeHtml(guildName)}" />` : `<div class="guild-icon"></div>`}
          <div class="hero-title">
            <span class="eyebrow">${escapeHtml(guildName)}</span>
            <span class="title">${escapeHtml(displayTitle)}</span>
          </div>
        </div>
      </div>
    </section>
    <section class="card">
      <h2>Details</h2>
      <div class="grid">
        <div class="stat"><strong>Guild ID</strong>${escapeHtml(String(channel.guild?.id ?? 'unknown'))}</div>
        <div class="stat"><strong>Channel ID</strong>${escapeHtml(String(channelId))}</div>
        ${ticket?.userId ? `<div class="stat"><strong>User</strong>${escapeHtml(String(ticket.userId))}</div>` : ''}
        ${ticket?.moderatorId ? `<div class="stat"><strong>Moderator</strong>${escapeHtml(String(ticket.moderatorId))}</div>` : ''}
        <div class="stat"><strong>Reason</strong>${escapeHtml(String(ticketReason))}</div>
        <div class="stat"><strong>Created</strong>${escapeHtml(createdAt || 'не указано')}</div>
        <div class="stat"><strong>Exported</strong>${escapeHtml(exportedAt || 'не указано')}</div>
        ${ticket?.department ? `<div class="stat"><strong>Department</strong>${escapeHtml(String(ticket.department))}</div>` : ''}
        ${ticket?.status ? `<div class="stat"><strong>Status</strong>${escapeHtml(String(ticket.status))}</div>` : ''}
      </div>
    </section>
    <section class="card">
      <h2>Messages (${messages.length})</h2>
      ${messageBlocks}
    </section>
    <footer class="transcript-footer">
      <span>discord-ticket-transcript</span>
      <span>${escapeHtml(footerDisplay)}</span>
    </footer>
  </div>
  ${buildClipboardScript()}
</body>
</html>`;

        let filePath = null;
        if (saveToFile) {
            const transcriptsDir = outputDir || path.join(process.cwd(), 'transcripts');
            try { fs.mkdirSync(transcriptsDir, { recursive: true }); } catch {}
            filePath = path.join(transcriptsDir, htmlFileName);
            try { fs.writeFileSync(filePath, html, 'utf8'); } catch (writeErr) {
                console.warn('[discord-ticket-transcript] Failed to write transcript file:', writeErr.message || writeErr);
                filePath = null;
            }
        }

        let attachment = null;
        if (djs && djs.AttachmentBuilder) {
            try {
                attachment = new djs.AttachmentBuilder(Buffer.from(html, 'utf8'), { name: htmlFileName });
            } catch (_) {
                attachment = null;
            }
        }

        return {
            html,
            filePath,
            attachment,
            fileName: htmlFileName,
            messageCount: messages.length,
            buffer: Buffer.from(html, 'utf8'),
        };
    } catch (e) {
        console.error('[discord-ticket-transcript] generateTranscript error', e);
        return null;
    }
}

function generateTranscriptHtmlOnly(channel, options = {}) {
    return generateTranscript(channel, { ...options, saveToFile: false }).then((r) => r?.html ?? null);
}

function generateTranscriptFromMessages(messages, options = {}) {
    return generateTranscript({
        id: options.channelId ?? 'custom',
        name: options.channelName ?? 'transcript',
        guild: options.guild ?? null,
    }, { ...options, messages, saveToFile: options.saveToFile ?? false });
}

module.exports = {
    generateTranscript,
    generateTranscriptHtmlOnly,
    generateTranscriptFromMessages,
    buildCss,
    buildClipboardScript,
    utils: {
        escapeHtml,
        sanitizeUrl,
        hexToRgb,
        formatDateTime,
        formatTime,
        formatTranscriptTimestamp,
        formatTranscriptRelativeTime,
        isLikelyImage,
        groupMessages,
        fetchAllMessages,
        createRenderDiscordFormattedText,
    },
    constants: {
        COMPONENT_TYPE,
        BUTTON_STYLE,
        MESSAGE_TYPE,
    },
};
