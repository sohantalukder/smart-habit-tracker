declare module 'react-native-html-to-pdf' {
  const HtmlToPdf: {
    convert(options: {
      html: string;
      fileName: string;
      directory?: string;
    }): Promise<{ filePath?: string }>;
  };
  export default HtmlToPdf;
}
