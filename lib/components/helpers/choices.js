// # choices component

/*
Render customized (non-native) dropdown choices.
*/

'use strict';

var React = require('react/addons');
var R = React.DOM;
var _ = require('underscore');

var CSSTransitionGroup = React.createFactory(React.addons.CSSTransitionGroup);

module.exports = React.createClass({

  displayName: 'Choices',

  mixins: [
    require('../../mixins/helper'),
    //plugin.require('mixin.resize'),
    //plugin.require('mixin.scroll'),
    require('../../mixins/click-outside')
  ],

  getInitialState: function () {
    return {
      maxHeight: null,
      open: this.props.open
    };
  },

  getIgnoreCloseNodes: function () {
    if (!this.props.ignoreCloseNodes) {
      return [];
    }
    var nodes = this.props.ignoreCloseNodes();
    if (!_.isArray(nodes)) {
      nodes = [nodes];
    }
    return nodes;
  },

  componentDidMount: function () {
    this.setOnClickOutside('choices', function (event) {

      // Make sure we don't find any nodes to ignore.
      if (!_.find(this.getIgnoreCloseNodes(), function (node) {
        return this.isNodeInside(event.target, node);
      }.bind(this))) {
        this.props.onClose();
      }
    }.bind(this));

    this.adjustSize();
  },

  onSelect: function (choice) {
    this.props.onSelect(choice.value);
  },

  onChoiceAction: function (choice) {
    this.props.onChoiceAction(choice);
  },

  onResizeWindow: function () {
    this.adjustSize();
  },

  onScrollWindow: function () {
    this.adjustSize();
  },

  adjustSize: function () {
    if (this.refs.choices) {
      var node = this.refs.choices.getDOMNode();
      var rect = node.getBoundingClientRect();
      var top = rect.top;
      var windowHeight = window.innerHeight;
      var height = windowHeight - top;
      this.setState({
        maxHeight: height
      });
    }
  },

  componentWillReceiveProps: function (nextProps) {
    this.setState({open: nextProps.open}, function () {
      this.adjustSize();
    }.bind(this));
  },

  onScroll: function () {
    // console.log('stop that!')
    // event.preventDefault();
    // event.stopPropagation();
  },

  onWheel: function () {
    // event.preventDefault();
    // event.stopPropagation();
  },

  render: function () {
    return this.renderWithConfig();
  },

  renderDefault: function () {

    var choices = this.props.choices;

    if (choices && choices.length === 0) {
      choices = [{value: '///empty///'}];
    }

    if (this.props.open) {
      return R.div({ref: 'container', onWheel: this.onWheel, onScroll: this.onScroll,
                    className: 'choices-container', style: {
        userSelect: 'none', WebkitUserSelect: 'none', position: 'absolute',
        maxHeight: this.state.maxHeight ? this.state.maxHeight : null
      }},
        CSSTransitionGroup({transitionName: 'reveal'},
          R.ul({ref: 'choices', className: 'choices'},
            choices.map(function (choice, i) {

              var choiceElement = null;

              if (choice.value === '///loading///') {
                choiceElement = R.a({href: 'JavaScript' + ':', onClick: this.props.onClose},
                  R.span({className: 'choice-label'},
                    'Loading...'
                  )
                );
              } else if (choice.value === '///empty///') {
                choiceElement = R.a({href: 'JavaScript' + ':', onClick: this.props.onClose},
                  R.span({className: 'choice-label'},
                    'No choices available.'
                  )
                );
              } else if (choice.action) {
                choiceElement = R.a({href: 'JavaScript' + ':', onClick: this.onChoiceAction.bind(this, choice)},
                  R.span({className: 'choice-label'},
                    this.props.config.actionChoiceLabel(choice.action)
                  )
                );
              }
              else {
                choiceElement = R.a({href: 'JavaScript' + ':', onClick: this.onSelect.bind(this, choice)},
                  R.span({className: 'choice-label'},
                    choice.label
                  ),
                  R.span({className: 'choice-sample'},
                    choice.sample
                  )
                );
              }

              return R.li({key: i, className: 'choice'},
                choiceElement
              );
            }.bind(this))
          )
        )
      );
    }

    // not open
    return null;
  }
});
