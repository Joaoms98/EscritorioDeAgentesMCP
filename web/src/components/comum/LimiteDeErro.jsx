import { Component } from 'react'

// Segura um erro de renderização num pedaço da tela sem derrubar o resto do app. Retorna o JSX.
export default class LimiteDeErro extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null }
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  render() {
    if (!this.state.erro) return this.props.children
    return this.props.alternativa({ tentarDeNovo: () => this.setState({ erro: null }) })
  }
}
