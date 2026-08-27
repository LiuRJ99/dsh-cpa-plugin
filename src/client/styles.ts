const CSS = `
.dsh-cpa-model-root{position:relative;min-width:0}
.dsh-cpa-account-indicator-shell{position:relative;box-sizing:border-box;display:inline-flex;align-items:center;flex:0 1 auto;min-width:0;max-width:200px;margin-left:4px}
.dsh-cpa-account-indicator{position:relative;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;width:auto;min-width:0;max-width:100%;height:28px;padding:0 8px;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#fff));color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:20px;text-align:left;white-space:nowrap;cursor:pointer}
.dsh-cpa-account-indicator:hover{border-color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-cpa-account-indicator:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}
.dsh-cpa-account-indicator-progress{position:absolute;inset:0 auto 0 0;z-index:0;width:0;background:var(--dsw-alias-state-success-label,#4caf70);opacity:.16;pointer-events:none;transition:width .2s ease}
.dsh-cpa-account-indicator.is-quota-low .dsh-cpa-account-indicator-progress{background:var(--dsw-alias-state-warn-label,#e3a33d)}
.dsh-cpa-account-indicator.is-unavailable .dsh-cpa-account-indicator-progress{background:var(--dsw-alias-state-error-primary,#e45c5c)}
.dsh-cpa-account-indicator-label,.dsh-cpa-account-indicator-quota,.dsh-cpa-account-indicator-dot{position:relative;z-index:1}
.dsh-cpa-account-indicator-label{min-width:0;flex:0 1 auto;overflow:hidden;color:var(--dsw-alias-label-primary);font-size:12px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-account-indicator-quota{flex:0 0 auto;min-width:0;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:right;text-overflow:ellipsis;font-variant-numeric:tabular-nums;white-space:nowrap}
.dsh-cpa-quota-full{display:inline}
.dsh-cpa-quota-short{display:none}
.dsh-cpa-account-indicator-dot{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:var(--dsw-alias-state-success-label,#4caf70);box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-2,#fff)}
.dsh-cpa-account-indicator.is-quota-low .dsh-cpa-account-indicator-dot{background:var(--dsw-alias-state-warn-label,#e3a33d)}
.dsh-cpa-account-indicator.is-unavailable .dsh-cpa-account-indicator-dot{background:var(--dsw-alias-state-error-primary,#e45c5c)}
@container (max-width: 640px){.dsh-cpa-account-indicator-shell{max-width:140px}.dsh-cpa-quota-full{display:none}.dsh-cpa-quota-short{display:inline}}
@container (max-width: 480px){.dsh-cpa-account-indicator-shell{max-width:80px}.dsh-cpa-account-indicator-label{display:none}.dsh-cpa-quota-full{display:none}.dsh-cpa-quota-short{display:inline}}
@container (max-width: 360px){.dsh-cpa-account-indicator-shell{max-width:32px}.dsh-cpa-account-indicator{padding:0 6px}.dsh-cpa-account-indicator-label{display:none}.dsh-cpa-account-indicator-quota{display:none}}
@media (max-width: 720px){.dsh-cpa-account-indicator-shell{max-width:140px}.dsh-cpa-quota-full{display:none}.dsh-cpa-quota-short{display:inline}}
@media (max-width: 560px){.dsh-cpa-account-indicator-shell{max-width:80px}.dsh-cpa-account-indicator-label{display:none}.dsh-cpa-quota-full{display:none}.dsh-cpa-quota-short{display:inline}}
@media (max-width: 420px){.dsh-cpa-account-indicator-shell{max-width:32px}.dsh-cpa-account-indicator{padding:0 6px}.dsh-cpa-account-indicator-label{display:none}.dsh-cpa-account-indicator-quota{display:none}}
.dsh-cpa-account-menu{position:absolute;left:0;bottom:calc(100% + 8px);z-index:30;display:flex;min-width:260px;max-width:min(300px,calc(100vw - 32px));max-height:min(300px,calc(100vh - 96px));flex-direction:column;gap:3px;overflow:auto;padding:5px;border:1px solid var(--dsw-alias-border-inverted);border-radius:10px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary)}
.dsh-cpa-account-option{position:relative;display:flex;align-items:center;gap:7px;width:100%;min-height:38px;overflow:hidden;padding:5px 7px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dsh-cpa-account-option:hover,.dsh-cpa-account-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dsh-cpa-account-option-progress{position:absolute;inset:0 auto 0 0;z-index:0;width:0;background:var(--dsw-alias-state-success-label,#4caf70);opacity:.14;pointer-events:none;transition:width .2s ease}
.dsh-cpa-account-option.is-quota-low .dsh-cpa-account-option-progress{background:var(--dsw-alias-state-warn-label,#e3a33d)}
.dsh-cpa-account-option.is-unavailable .dsh-cpa-account-option-progress{background:var(--dsw-alias-state-error-primary,#e45c5c)}
.dsh-cpa-account-option-copy,.dsh-cpa-account-option-quota,.dsh-cpa-account-option-check{position:relative;z-index:1}
.dsh-cpa-account-option-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:0;overflow:hidden}
.dsh-cpa-account-option-copy strong,.dsh-cpa-account-option-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-account-option-copy strong{font-size:12px;font-weight:600;line-height:15px}
.dsh-cpa-account-option-copy small{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:13px}
.dsh-cpa-account-option-quota{max-width:75px;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:right;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-account-option-check{flex:0 0 14px;color:var(--dsw-alias-label-primary);text-align:center}
.dsh-cpa-account-menu-error{padding:5px 7px;color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:15px}
.dsh-cpa-model-trigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:220px;height:28px;padding:0 4px 0 8px;border:0;border-radius:24px;outline:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;font-weight:500;cursor:pointer}
.dsh-cpa-model-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-cpa-model-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
.dsh-cpa-model-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-cpa-model-trigger-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-model-trigger-effort{flex:0 0 auto;color:var(--dsw-alias-label-caption)}
.dsh-cpa-model-trigger-speed{flex:0 0 auto;color:var(--dsw-alias-label-caption)}
.dsh-cpa-chevron{flex:0 0 auto;color:var(--dsw-alias-label-caption);transition:transform 120ms ease}
.dsh-cpa-chevron.is-open{transform:rotate(180deg)}
.dsh-cpa-model-menu{position:absolute;right:0;bottom:calc(100% + 8px);z-index:20;display:flex;flex-direction:column;width:min(240px,calc(100vw - 32px));max-height:min(360px,calc(100vh - 96px));overflow:hidden;padding:4px;border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dsh-cpa-menu-row{display:flex;align-items:center;gap:8px;width:100%;height:40px;padding:0 10px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;cursor:pointer;text-align:left}
.dsh-cpa-menu-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-cpa-menu-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-menu-value{flex:0 1 auto;min-width:0;overflow:hidden;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-menu-chevron{flex:0 0 auto;color:var(--dsw-alias-label-tertiary)}
.dsh-cpa-model-list,.dsh-cpa-model-groups{min-height:0;overflow-y:auto}
.dsh-cpa-model-group+.dsh-cpa-model-group{margin-top:4px}
.dsh-cpa-group-title{position:sticky;top:0;z-index:1;padding:5px 8px 3px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-weight:500}
.dsh-cpa-option{display:flex;align-items:center;gap:8px;width:100%;min-height:38px;padding:6px 8px;border:0;border-radius:10px;outline:none;background:transparent;color:inherit;text-align:left;cursor:pointer}
.dsh-cpa-option:hover:not(:disabled),.dsh-cpa-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-cpa-option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-cpa-option-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}
.dsh-cpa-account-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}
.dsh-cpa-account-title{overflow:hidden;font-size:13px;line-height:19px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-model-name{overflow:hidden;color:inherit;font-size:14px;line-height:20px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-description{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-check{display:grid;place-items:center;flex:0 0 18px;color:var(--dsw-alias-label-primary)}
.dsh-cpa-option small{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-status{padding:10px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.dsh-cpa-error{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;padding:7px 8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.dsh-cpa-error button{flex:0 0 auto;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.dsh-cpa-settings-card{margin:0;padding:0;list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);overflow:hidden;transition:border-color .16s,background .16s}
.dsh-cpa-settings-card:hover{border-color:var(--dsw-alias-label-dimmed)}
.dsh-cpa-settings-header{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer}
.dsh-cpa-settings-header>span:first-child{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}
.dsh-cpa-settings-header strong{font-size:15px;line-height:21px;font-weight:600}
.dsh-cpa-settings-header small{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:19px}
.dsh-cpa-settings-header em{color:var(--dsw-alias-state-warn-label);font-size:12px;font-style:normal}
.dsh-cpa-settings-body{margin:0 16px;padding:0 0 8px;border-top:1px solid var(--dsw-alias-border-l2)}
.dsh-cpa-settings-field{position:relative;display:flex;flex-direction:column;gap:5px;margin-top:14px}
.dsh-cpa-settings-field label{font-size:13px;font-weight:600}
.dsh-cpa-settings-field input{box-sizing:border-box;width:100%;min-height:34px;padding:7px 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-white,#fff);color:var(--dsw-alias-label-primary);font:inherit}
.dsh-cpa-settings-field input:focus{outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}
.dsh-cpa-settings-field input:disabled{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-dimmed)}
.dsh-cpa-settings-field small,.dsh-cpa-settings-note,.dsh-cpa-settings-muted{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dsh-cpa-key-state{position:absolute;right:0;top:0;border-radius:999px;padding:1px 8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px;white-space:nowrap}
.dsh-cpa-key-state.is-set{color:var(--dsw-alias-label-secondary)}
.dsh-cpa-settings-accounts{margin-top:18px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l2)}
.dsh-cpa-settings-accounts-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dsh-cpa-settings-accounts-head strong{font-size:13px}
.dsh-cpa-settings-accounts-head button{padding:0;border:0;background:transparent;color:var(--dsw-alias-interactive-label-primary);font:inherit;font-size:12px;cursor:pointer}
.dsh-cpa-settings-accounts-head button:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-cpa-settings-note{margin-top:7px}
.dsh-cpa-account-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px;line-height:19px}
.dsh-cpa-account-row:last-child{border-bottom:0}
.dsh-cpa-account-row>span:first-child{display:flex;min-width:0;flex-direction:column;gap:2px}
.dsh-cpa-account-row strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-account-row small{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dsh-cpa-account-row>span:last-child{flex:0 0 auto;text-align:right}
.dsh-cpa-account-quota{display:flex;min-width:0;flex-direction:column;gap:5px;margin-top:4px}
.dsh-cpa-account-quota-window{display:grid;grid-template-columns:38px minmax(80px,1fr) auto;align-items:center;column-gap:7px;row-gap:1px;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dsh-cpa-account-quota-label{white-space:nowrap}
.dsh-cpa-account-quota-track{display:block;height:5px;min-width:0;overflow:hidden;border-radius:999px;background:var(--dsw-alias-bg-module-platform,#edf0f2)}
.dsh-cpa-account-quota-fill{display:block;height:100%;border-radius:inherit;background:var(--dsw-alias-state-success-label,#4caf70);transition:width .16s ease}
.dsh-cpa-account-quota-window.is-quota-low .dsh-cpa-account-quota-fill{background:var(--dsw-alias-state-warn-label,#e3a33d)}
.dsh-cpa-account-quota-window.is-unavailable .dsh-cpa-account-quota-fill{background:var(--dsw-alias-state-error-primary,#e45c5c)}
.dsh-cpa-account-quota-window.is-unknown .dsh-cpa-account-quota-track{opacity:.55}
.dsh-cpa-account-quota-value{min-width:34px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.dsh-cpa-account-quota-reset{grid-column:2 / -1;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px;white-space:nowrap}
.dsh-cpa-account-quota-empty{margin-top:2px}
.dsh-cpa-account-status-dot{display:inline-block;width:9px;height:9px;flex:0 0 9px;border-radius:50%;box-shadow:0 0 0 2px var(--dsw-specific-menu,#fff)}
.dsh-cpa-account-status-dot.is-available{background:var(--dsw-alias-state-success-label,#4caf70)}
.dsh-cpa-account-status-dot.is-quota-low{background:var(--dsw-alias-state-warn-label,#e3a33d)}
.dsh-cpa-account-status-dot.is-unavailable{background:var(--dsw-alias-state-error-primary,#e45c5c)}
.dsh-cpa-account-state{font-size:11px;font-weight:600}
.dsh-cpa-account-state.is-available{color:var(--dsw-alias-state-success-label)}
.dsh-cpa-account-state.is-quota-low{color:var(--dsw-alias-state-warn-label)}
.dsh-cpa-account-state.is-unavailable{color:var(--dsw-alias-state-error-primary)}
.dsh-cpa-settings-error{margin:10px 0 0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.dsh-cpa-settings-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:18px;padding:12px 0 4px;border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-white,#fff)}
.dsh-cpa-settings-actions button{appearance:none;border:1px solid transparent;border-radius:8px;padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}
.dsh-cpa-settings-actions button:not(.is-primary){border-color:var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary)}
.dsh-cpa-settings-actions button:not(.is-primary):hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed);color:var(--dsw-alias-label-primary)}
.dsh-cpa-settings-actions button.is-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-white,#fff)}
.dsh-cpa-settings-actions button:disabled{opacity:.4;cursor:default}
.dsh-cpa-settings-actions button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-cpa-model-settings{margin-top:18px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:14px}
.dsh-cpa-model-settings-header{display:flex;align-items:center;gap:12px;width:100%;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer}
.dsh-cpa-model-settings-header>span:first-child{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}
.dsh-cpa-model-settings-header strong{font-size:13px;line-height:20px}
.dsh-cpa-model-settings-header small{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dsh-cpa-model-settings-header em{color:var(--dsw-alias-state-warn-label);font-size:11px;font-style:normal}
.dsh-cpa-model-settings-body{padding-top:12px}
.dsh-cpa-model-settings-meta{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin-bottom:12px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dsh-cpa-model-settings-meta strong{min-width:0;overflow:hidden;color:var(--dsw-alias-label-secondary);font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-model-settings-list-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px}
.dsh-cpa-model-settings-list-head strong{font-size:13px}
.dsh-cpa-model-settings-list-head button{padding:0;border:0;background:transparent;color:var(--dsw-alias-interactive-label-primary);font:inherit;font-size:12px;cursor:pointer}
.dsh-cpa-model-settings-list-head button:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-cpa-model-draft{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 26px;gap:6px;margin-top:8px}
.dsh-cpa-model-draft input{box-sizing:border-box;width:100%;min-height:32px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-white,#fff);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.dsh-cpa-model-draft input:focus{outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}
.dsh-cpa-model-draft input:disabled{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-dimmed)}
.dsh-cpa-model-draft button{border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:18px;cursor:pointer}
.dsh-cpa-model-draft button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}
.dsh-cpa-model-draft button:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-cpa-model-add{margin-top:9px;padding:5px 0;border:0;background:transparent;color:var(--dsw-alias-interactive-label-primary);font:inherit;font-size:12px;cursor:pointer}
.dsh-cpa-model-add:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
[data-dsh-cpa-settings-nav]>svg:first-child{display:none}
[data-dsh-cpa-settings-nav]::before{content:'';flex:none;width:16px;height:16px;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='6' cy='12' r='3'/%3E%3Ccircle cx='18' cy='6' r='3'/%3E%3Ccircle cx='18' cy='18' r='3'/%3E%3Cpath d='M8.7 10.7 15.3 7.3'/%3E%3Cpath d='M8.7 13.3 15.3 16.7'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='6' cy='12' r='3'/%3E%3Ccircle cx='18' cy='6' r='3'/%3E%3Ccircle cx='18' cy='18' r='3'/%3E%3Cpath d='M8.7 10.7 15.3 7.3'/%3E%3Cpath d='M8.7 13.3 15.3 16.7'/%3E%3C/svg%3E") center/contain no-repeat}
`

export function installStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.querySelector('style[data-dsh-cpa-plugin]')
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.dshCpaPlugin = 'true'
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
