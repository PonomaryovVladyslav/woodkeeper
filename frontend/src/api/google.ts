const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

let loading: Promise<void> | null = null

/** Loads Google Identity Services once per page. */
export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve()
  }
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('Failed to load Google Identity Services'))
    }
    document.head.appendChild(script)
  })
  return loading
}
