!macro NSIS_HOOK_PREINSTALL
  ; Disable shortcut creation before installer creates them (if supported).
  StrCpy $NoShortcutMode 1
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Ensure no shortcuts remain after install.
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\Uninstall ${PRODUCTNAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCTNAME}"
!macroend
