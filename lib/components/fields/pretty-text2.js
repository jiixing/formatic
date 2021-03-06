'use strict';
/* global CodeMirror */
/*eslint no-script-url:0 */

var React = require('react/addons');
var TagTranslator = require('../helpers/tag-translator');
var _ = require('../../undash');
var cx = require('classnames');

/*
   Editor for tagged text. Renders text like "hello {{firstName}}"
   with replacement labels rendered in a pill box. Designed to load
   quickly when many separate instances of it are on the same
   page.

   Uses CodeMirror to edit text. To save memory the CodeMirror node is
   instantiated when the user moves the mouse into the edit area.
   Initially a read-only view using a simple div is shown.
 */
module.exports = React.createClass({

  displayName: 'PrettyText',

  mixins: [require('../../mixins/field')],

  componentDidMount: function() {
    this.createEditor();
  },

  componentDidUpdate: function(prevProps, prevState) {
    if (prevState.codeMirrorMode !== this.state.codeMirrorMode) {
      // Changed from code mirror mode to read only mode or vice versa,
      // so setup the other editor.
      this.createEditor();
    }
  },

  componentWillUnmount: function() {
    if (this.state.codeMirrorMode) {
      this.removeCodeMirrorEditor();
    }
  },

  getInitialState: function() {
    var selectedChoices = this.props.config.fieldSelectedReplaceChoices(this.props.field);
    var replaceChoices = this.props.config.fieldReplaceChoices(this.props.field);
    var translator = TagTranslator(selectedChoices.concat(replaceChoices), this.props.config.humanize);

    return {
      value: this.props.field.value,
      codeMirrorMode: false,
      isChoicesOpen: false,
      replaceChoices: replaceChoices,
      translator: translator
    };
  },

  componentWillReceiveProps: function(nextProps) {
    var selectedChoices = this.props.config.fieldSelectedReplaceChoices(this.props.field);
    var replaceChoices = this.props.config.fieldReplaceChoices(nextProps.field);
    var nextState = {
      replaceChoices: replaceChoices,
      translator: TagTranslator(selectedChoices.concat(replaceChoices), this.props.config.humanize)
    };

    if (this.state.value !== nextProps.field.value && nextProps.field.value) {
      nextState.value = nextProps.field.value;
    }

    this.setState(nextState);
  },

  handleChoiceSelection: function (key) {
    var pos = this.state.selectedTagPos;
    var tag = '{{' + key + '}}';

    if (pos) {
      this.codeMirror.replaceRange(tag, {line: pos.line, ch: pos.start}, {line: pos.line, ch: pos.stop});
    } else {
      this.codeMirror.replaceSelection(tag, 'end');
    }
    this.codeMirror.focus();

    this.setState({ isChoicesOpen: false, selectedTagPos: null });
  },

  render: function() {
    return this.renderWithConfig();
  },

  renderDefault: function () {

    var config = this.props.config;
    var field = this.props.field;
    var props = { field: field, plain: this.props.plain };
    var tabIndex = field.tabIndex;
    var textBoxClasses = cx(_.extend({}, this.props.classes, {'pretty-text-box': true}));

    var onInsertClick = function () {
      this.setState({selectedTagPos: null});
      this.onToggleChoices();
    };
    var insertBtn = config.createElement('insert-button',
                                         {ref: 'toggle', onClick: onInsertClick.bind(this)},
                                         'Insert...');

    var choices = config.createElement('choices', {
      ref: 'choices',
      choices: this.state.replaceChoices,
      open: this.state.isChoicesOpen,
      ignoreCloseNodes: this.getCloseIgnoreNodes,
      onSelect: this.handleChoiceSelection,
      onClose: this.onCloseChoices,
      isAccordion: this.props.field.isAccordion
    });

    // Render read-only version.
    var element = (
      <div className={cx({'pretty-text-wrapper': true, 'choices-open': this.state.isChoicesOpen})} onMouseEnter={this.switchToCodeMirror}>
        <div className={textBoxClasses} tabIndex={tabIndex} onFocus={this.onFocusAction} onBlur={this.onBlurAction}>
          <div ref='textBox' className='internal-text-wrapper' />
        </div>

        {insertBtn}
        {choices}
      </div>
    );

    return config.createElement('field', props, element);
  },

  getCloseIgnoreNodes: function () {
    return this.refs.toggle.getDOMNode();
  },

  onToggleChoices: function () {
    this.setChoicesOpen(!this.state.isChoicesOpen);
  },

  setChoicesOpen: function (isOpen) {
    var action = isOpen ? 'open-replacements' : 'close-replacements';
    this.onStartAction(action);
    this.setState({ isChoicesOpen: isOpen });
  },

  onCloseChoices: function () {
    if (this.state.isChoicesOpen) {
      this.setChoicesOpen(false);
    }
  },

  createEditor: function () {
    if (this.state.codeMirrorMode) {
      this.createCodeMirrorEditor();
    } else {
      this.createReadonlyEditor();
    }
  },

  createCodeMirrorEditor: function () {
    var options = {
      lineWrapping: true,
      tabindex: this.props.tabIndex,
      value: String(this.state.value),
      mode: null,
      extraKeys: {
        Tab: false
      }
    };

    var textBox = this.refs.textBox.getDOMNode();
    textBox.innerHTML = ''; // release any previous read-only content so it can be GC'ed

    this.codeMirror = CodeMirror(textBox, options);
    this.codeMirror.on('change', this.onCodeMirrorChange);

    this.tagCodeMirror();
  },

  tagCodeMirror: function () {
    var positions = this.state.translator.getTagPositions(this.codeMirror.getValue());
    var self = this;

    var tagOps = function () {
      positions.forEach(function (pos) {
        var node = self.createTagNode(pos);
        self.codeMirror.markText({line: pos.line, ch: pos.start},
                                 {line: pos.line, ch: pos.stop},
                                 {replacedWith: node, handleMouseEvents: true});
      });
    };

    this.codeMirror.operation(tagOps);
  },

  onCodeMirrorChange: function () {
    if (this.updatingCodeMirror) {
      // avoid recursive update cycle, and mark the code mirror manual update as done
      this.updatingCodeMirror = false;
      return;
    }

    var newValue = this.codeMirror.getValue();
    this.onChangeValue(newValue);
    this.setState({value: newValue});
    this.tagCodeMirror();
  },

  createReadonlyEditor: function () {
    var textBoxNode = this.refs.textBox.getDOMNode();

    var tokens = this.state.translator.tokenize(this.state.value);
    var self = this;
    var nodes = tokens.map(function (part, i) {
      if (part.type === 'tag') {
        var label = self.state.translator.getLabel(part.value);
        var props = {key: i, tag: part.value, replaceChoices: self.state.replaceChoices};
        return self.props.config.createElement('pretty-tag', props, label);
      }
      return <span key={i}>{part.value}</span>;
    });

    React.render(<span>{nodes}</span>, textBoxNode);
  },

  removeCodeMirrorEditor: function () {
    var textBoxNode = this.refs.textBox.getDOMNode();
    var cmNode = textBoxNode.firstChild;
    textBoxNode.removeChild(cmNode);
    this.codeMirror = null;
  },

  switchToCodeMirror: function () {
    if (!this.state.codeMirrorMode) {
      this.setState({codeMirrorMode: true});
    }
  },

  createTagNode: function (pos) {
    var node = document.createElement('span');
    var label = this.state.translator.getLabel(pos.tag);
    var config = this.props.config;

    var onTagClick = function () {
      this.setState({selectedTagPos: pos});
      this.onToggleChoices();
    };

    var props = {tag: pos.tag, replaceChoices: this.state.replaceChoices, onClick: onTagClick.bind(this)};

    React.render(
      config.createElement('pretty-tag', props, label),
      node
    );

    return node;
  }
});
