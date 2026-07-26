import {
  Text as NativeText,
  TextInput as NativeTextInput,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { bloomFonts } from './bloomTheme';

type NativeComponentWithDefaults = {
  defaultProps?: {
    style?: StyleProp<TextStyle>;
  };
};

function applyDefaultFont(component: NativeComponentWithDefaults) {
  const target = component;
  const currentStyle = target.defaultProps?.style;
  target.defaultProps = {
    ...target.defaultProps,
    style: [currentStyle, { fontFamily: bloomFonts.body }],
  };
}

export function configureBloomTypography() {
  applyDefaultFont(NativeText as unknown as NativeComponentWithDefaults);
  applyDefaultFont(NativeTextInput as unknown as NativeComponentWithDefaults);
}
