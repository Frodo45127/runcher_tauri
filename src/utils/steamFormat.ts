/**
 * Convert Steam BBCode format to HTML
 * @param {string} text - The text to convert from BBCode to HTML
 * @returns {string} - The converted HTML text
 */
export function steamFormatToHtml(text: string): string {
  if (!text) return '';

  let html = text;

  // Jumplines.
  html = html.replace(/\r\n/g, '<br/>');
  html = html.replace(/\n/g, '<br/>');

  // Headers
  html = html.replace(/\[h1\](.*?)\[\/h1\]/g, '<h1>$1</h1>');
  html = html.replace(/\[h2\](.*?)\[\/h2\]/g, '<h2>$1</h2>');
  html = html.replace(/\[h3\](.*?)\[\/h3\]/g, '<h3>$1</h3>');

  // Basic text formatting
  html = html.replace(/\[b\](.*?)\[\/b\]/g, '<strong>$1</strong>');
  html = html.replace(/\[u\](.*?)\[\/u\]/g, '<u>$1</u>');
  html = html.replace(/\[i\](.*?)\[\/i\]/g, '<em>$1</em>');
  html = html.replace(/\[strike\](.*?)\[\/strike\]/g, '<del>$1</del>');
  
  // Spoiler
  html = html.replace(/\[spoiler\](.*?)\[\/spoiler\]/g, 
    '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');

  // No parse
  html = html.replace(/\[noparse\](.*?)\[\/noparse\]/g, 
    (_match, p1) => p1.replace(/</g, '&lt;').replace(/>/g, '&gt;'));

  // Horizontal rule
  html = html.replace(/\[hr\]\[\/hr\]/g, '<hr>');

  // URLs
  html = html.replace(/\[url=([^\]]+)\](.*?)\[\/url\]/g, '<a href="$1" target="_blank">$2</a>');

  // Lists
  html = html.replace(/\[list\]([\s\S]*?)\[\/list\]/g, (_match, content) => {
    const items = content.split('[*]').filter((item: string) => item.trim());
    return '<ul>' + items
      .filter((item: string) => item !== '<br/>')
      .map((item: string) => {
        if (item.startsWith('<br/>')) {
          item = item.slice(5);
        }
        return '<li>' + item + '</li>';
      })
      .join('') + '</ul>';
  });

  // Unfinished Lists (damn tabletop caps compat mod)
  html = html.replace(/\[list\]([\s\S]*?)$/g, (_match, content) => {
    const items = content.split('[*]').filter((item: string) => item.trim());
    return '<ul">' + items
      .filter((item: string) => item !== '<br/>')
      .map((item: string) => {
        if (item.startsWith('<br/>')) {
          item = item.slice(5);
        }
        return '<li>' + item + '</li>';
      })
      .join('') + '</ul>';
  });

  html = html.replace(/\[olist\]([\s\S]*?)\[\/olist\]/g, (_match, content) => {
    const items = content.trim().split('[*]').filter((item: string) => item.trim());
    return '<ol>' + items
      .filter((item: string) => item !== '<br/>')
      .map((item: string) => {
        if (item.startsWith('<br/>')) {
          item = item.slice(5);
        }
        return '<li>' + item + '</li>';
      })
      .join('') + '</ol>';
  });

  // Quotes
  html = html.replace(/\[quote=([^\]]+)\]([\s\S]*?)\[\/quote\]/g, 
    '<blockquote><p><em>Originally posted by <strong>$1</strong>:</em></p><p>$2</p></blockquote>');

  // Code blocks
  html = html.replace(/\[code\]([\s\S]*?)\[\/code\]/g, 
    '<pre><code>$1</code></pre>');

  // Tables
  html = html.replace(/\[table(?:=([^\]]+))?\]([\s\S]*?)\[\/table\]/g, (_match, attrs, content) => {
    const tableAttrs = [];
    if (attrs) {
      const attrPairs = attrs.split(' ');
      for (const pair of attrPairs) {
        const [key, value] = pair.split('=');
        if (key === 'noborder' && value === '1') {
          tableAttrs.push('class="no-border"');
        } else if (key === 'equalcells' && value === '1') {
          tableAttrs.push('class="equal-cells"');
        }
      }
    }
    
    const tableHtml = content
      .replace(/\[tr\]([\s\S]*?)\[\/tr\]/g, '<tr>$1</tr>')
      .replace(/\[th\]([\s\S]*?)\[\/th\]/g, '<th>$1</th>')
      .replace(/\[td\]([\s\S]*?)\[\/td\]/g, '<td>$1</td>');
    
    return `<table ${tableAttrs.join(' ')}>${tableHtml}</table>`;
  });

  // Images
  html = html.replace(/\[img\](.*?)\[\/img\]/g, '<img src="$1" alt="$1" style="max-width: 100%; height: auto;">');
/*
  // YouTube, Steam store, and Workshop links
  html = html.replace(
    /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/g,
    '<div class="video-container"><iframe src="https://www.youtube.com/embed/$4" frameborder="0" allowfullscreen></iframe></div>'
  );

  html = html.replace(
    /https?:\/\/store\.steampowered\.com\/app\/(\d+)/g,
    '<div class="steam-widget" data-store-app="$1"></div>'
  );

  html = html.replace(
    /https?:\/\/steamcommunity\.com\/sharedfiles\/filedetails\/\?id=(\d+)/g,
    '<div class="steam-widget" data-workshop-item="$1"></div>'
  );*/

  return html;
}
