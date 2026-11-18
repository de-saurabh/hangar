// toasted-notifier ships no types; Hangar only uses notify().
declare module 'toasted-notifier' {
  const notifier: { notify(options: { title: string; message: string; sound?: boolean }): void }
  export default notifier
}
