!macro NSIS_HOOK_POSTINSTALL
  ; Prevent desktop shortcut creation for NSIS installers.
  StrCpy $NoShortcutMode 1
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
!macroend
