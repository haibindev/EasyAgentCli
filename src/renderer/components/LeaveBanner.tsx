import { useI18n } from '../i18n-context'

export default function LeaveBanner() {
  const { t } = useI18n()
  return (
    <div className="leave-banner">
      {t.leaveBannerText}
    </div>
  )
}
