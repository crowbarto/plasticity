import { Disposable } from 'event-kit';
import { render } from 'preact';
import * as cmd from '../../commands/GeometryCommands';
import { Editor } from '../../editor/Editor';
import { DatabaseLike } from '../../editor/GeometryDatabase';
import { SelectionMode } from '../../selection/SelectionInteraction';
import { HasSelection } from '../../selection/SelectionManager';
import { icons, tooltips } from './icons';

export class Model {
    constructor(
        private readonly selection: HasSelection,
        private readonly db: DatabaseLike
    ) { }

    get commands() {
        const result = [];
        const { db, selection } = this;
        if (selection.curves.size > 0 || selection.solids.size > 0 || selection.faces.size > 0 || selection.controlPoints.size > 0) {
            result.push(cmd.DeleteCommand);
        }
        if (selection.curves.size > 0 || selection.solids.size > 0 || selection.faces.size > 0) {
            result.push(cmd.ShellCommand);
        }

        if (selection.regions.size > 0) {
            result.push(cmd.ExtrudeCommand);
        }
        if (selection.solids.size > 0) {
            result.push(cmd.MoveCommand);
            result.push(cmd.RotateCommand);
            result.push(cmd.ScaleCommand);
            if (selection.faces.size === 0 && selection.edges.size === 0 && selection.curves.size === 0)
                result.push(cmd.SymmetryCommand); // mirror
        }
        if (selection.solids.size > 1) {
            result.push(cmd.UnionCommand);
            result.push(cmd.IntersectionCommand);
            result.push(cmd.DifferenceCommand);
        }
        if (selection.faces.size > 0) {
            result.push(cmd.DraftSolidCommand); // this becomes rotate
            result.push(cmd.OffsetCurveCommand);
            result.push(cmd.ExtrudeCommand);
            result.push(cmd.ActionFaceCommand); // this becomes move
            result.push(cmd.CreateFaceCommand); // This becomes duplicate
        }
        if ((selection.faces.size > 0 || selection.solids.size > 0) && selection.curves.size > 0) {
            result.push(cmd.CutCommand);
        }
        if (selection.curves.size > 0) {
            result.push(cmd.ExtrudeCommand);
            result.push(cmd.RevolutionCommand);
            result.push(cmd.MirrorCommand);
            result.push(cmd.FilletCurveCommand);
            result.push(cmd.OffsetCurveCommand);
        }
        if (selection.curves.size > 1) {
            result.push(cmd.LoftCommand);
            result.push(cmd.JoinCurvesCommand);
        }
        if (selection.controlPoints.size > 0) {
            result.push(cmd.FilletCurveCommand);
        }
        return result;
    }
}

export default (editor: Editor) => {
    class Tooltip extends HTMLElement {
        dispose?: Disposable

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
        }

        connectedCallback() {
            this.dispose = editor.tooltips.add(this.parentElement, {
                title: this.innerHTML,
                placement: this.getAttribute('placement') ?? undefined,
                keyBindingCommand: this.getAttribute('command'),
            });
        }

        disconnectedCallback() {
            this.dispose!.dispose();
        }
    }
    customElements.define('ispace-tooltip', Tooltip);

    class Toolbar extends HTMLElement {
        private readonly model = new Model(editor.selection.selected, editor.db);

        constructor() {
            super();
            this.render = this.render.bind(this);
        }

        connectedCallback() {
            editor.signals.selectionChanged.add(this.render);
            this.render();
        }

        render() {
            // preact's diffing algorithm will mutate ispace-tooltips rather than create new ones, which leads to corruption;
            // So, force things to be cleared first.
            render('', this);
            const result = (
                <>
                    {this.model.commands.map(command => {
                        const tooltip = tooltips.get(command);
                        if (!tooltip) throw "invalid tooltip for " + command;
                        return <button onClick={_ => editor.enqueue(new command(editor))} name={command.identifier} tabIndex={-1}>
                            <img src={icons.get(command)}></img>
                            <ispace-tooltip placement="top" command={`command:${command.identifier}`}>{tooltip}</ispace-tooltip>
                        </button>
                    })}
                </>
            );
            render(result, this);
        }

        disconnectedCallback() {
            editor.signals.selectionChanged.remove(this.render);
        }
    }
    customElements.define('ispace-toolbar', Toolbar);
}
