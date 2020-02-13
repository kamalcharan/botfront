import { Meteor } from 'meteor/meteor';
import { checkIfCan } from '../../lib/scopes';

if (Meteor.isServer) {
    Meteor.publish('roles', function () {
        // -permission- is gloabal-settings the right permission here
        checkIfCan('global-settings:r');
        return Meteor.roles.find({});
    });
}
