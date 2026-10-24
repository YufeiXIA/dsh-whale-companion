window.__ModuleLoader__.load({ id: 'dsh-game-companion', factory(require) {
  const React = require('react');
  const h = React.createElement;
  function Panel() {
    const [open, setOpen] = React.useState(false);
    return h(React.Fragment, null,
      h('button', { onClick: () => setOpen(!open), style: { position: 'fixed', right: 18, bottom: 16, pointerEvents: 'auto', zIndex: 9001, padding: '10px 16px', borderRadius: 18, border: '1px solid #8faac6', color: '#e9f5ff', background: '#163044' } }, '🐋 游戏搭子'),
      // The companion's routes only answer the desktop window, which holds the session cookie.
      open && h('div', { role: 'note', style: { position: 'fixed', right: 18, bottom: 68, width: 300, padding: '14px 16px', lineHeight: 1.6, border: '1px solid #8faac6', borderRadius: 16, pointerEvents: 'auto', zIndex: 9001, color: '#e9f5ff', background: '#101e2c' } },
        '大肥鱼住在桌面窗口里。运行 start-whale-companion.ps1 叫醒她；为了隐私，这里的网页不能直接打开她的面板。')
    );
  }
  return { inject: ['slots'], apply(ctx) {
    const slots = ctx.get('slots');
    slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: 'whale-game-companion', order: 45 }, Panel));
  }};
}});
