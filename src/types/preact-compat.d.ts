import 'preact'
import * as React from 'react'

declare module 'preact' {
  namespace JSX {
    interface Element extends React.ReactElement<any, any> {}
  }
}
