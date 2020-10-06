import { drive_v3 } from 'googleapis';

export interface Options {
  //---
  // All the following options are OPTIONAL
  //---
  /**
   * To fetch only documents to specific folders
   * folders Ids can be found in Google Drive URLs
   * https://drive.google.com/drive/folders/FOLDER_ID
   */
  folders?: string[]

  /** h1 -> h2, h2 -> h3, ... */
  demoteHeadings?: boolean,
  /** Indented blocks of text are interpreted as blockquotes */
  indentedBlockquotes?: boolean
  /**
   * You could need to fetch additional documents fields to your nodes
   * All available options: https://developers.google.com/drive/api/v3/reference/files#resource
   */
  fields?: string[],
  /**
   * To rename fields
   * Be careful, some documentation instructions could be different
   */
  fieldsMapper?: Record<string, string>,
  /**
   * To add default fields values
   */
  fieldsDefault?: Record<string, unknown>,
  /**
   * To ignore some folder in the tree
   * It can be folder names or IDs
   */
  ignoredFolders?: string[]
  /**
   * Compute extra data for each document
   */
  updateMetadata?: (metadata: any) => any
  listImages?: boolean
  /**
   * For a better stack trace and more information
   * Usefull when you open a issue to report a bug
   */
  debug?: boolean,
}

export interface DocumentFile extends drive_v3.Schema$File {
  mimeType: "application/vnd.google-apps.document";
}

export interface RawFolder extends drive_v3.Schema$File {
  mimeType: "application/vnd.google-apps.folder";
}

export interface Metadata extends DocumentFile {
  id: NonNullable<DocumentFile['id']>;
  /** The filename, like path.basename(filepath) */
  name: string;
  path: string;
  parentPath: string;
  images?: drive_v3.Schema$File[];
  description?: string | object;
  content: any[];
  cover: {
      image: any;
      title: any;
      alt: any;
      image___NODE?: any;
  };
  markdown: string;
  breadcrumb: string[];
}

interface MdElementTypes {
  blockquote: string | string[];
  code: CodeInput;
  h1: string | string[];
  h2: string | string[];
  h3: string | string[];
  h4: string | string[];
  h5: string | string[];
  h6: string | string[];
  img: ImgInput | ImgInput[];
  ol: string[];
  p: string | string[];
  table: TableInput;
  ul: string[];
  footnote: {number: string, text: string};
}

interface ImgInput {
  title: string;
  source: string;
}

interface CodeInput {
  language?: string;
  content: string | string[];
}

interface TableInput {
  headers: string[];
  rows: Array<{ [column: string]: string }> | string[][];
}

export type Json2MdElements = {
  [Type in keyof MdElementTypes]: {
    type: Type;
    value: MdElementTypes[Type];
  }
};
export type Json2MdElement = Json2MdElements[keyof MdElementTypes];
export interface Json2MdHeading {
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  text: Json2MdElements[Json2MdHeading['tag']]['value']
}
