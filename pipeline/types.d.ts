declare module 'gdal3.js/node.js' {
  import initGdalJs from 'gdal3.js';
  export default initGdalJs;
}

declare module 'mapshaper' {
  const mapshaper: {
    applyCommands(commands: string, input?: Record<string, string | Buffer | object>): Promise<Record<string, Buffer | string>>;
  };
  export default mapshaper;
}
