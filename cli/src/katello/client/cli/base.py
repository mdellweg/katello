# -*- coding: utf-8 -*-

# Copyright © 2010 Red Hat, Inc.
#
# This software is licensed to you under the GNU General Public License,
# version 2 (GPLv2). There is NO WARRANTY for this software, express or
# implied, including the implied warranties of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE. You should have received a copy of GPLv2
# along with this software; if not, see
# http://www.gnu.org/licenses/old-licenses/gpl-2.0.txt.
#
# Red Hat trademarks are not licensed under GPLv2. No permission is
# granted to use or replicate Red Hat trademarks that are incorporated
# in this software or its documentation.

import os
import sys
from traceback import format_exc
from gettext import gettext as _
from kerberos import GSSError
from optparse import OptionGroup, SUPPRESS_HELP
from katello.client.i18n_optparse import OptionParser, OptionParserExitError
from katello.client.core.utils import parse_tokens
from katello.client.utils.encoding import u_str

from katello.client.core.base import Command

from katello.client.api.version import VersionAPI
from katello.client.config import Config
from katello.client.logutil import getLogger, logfile
from katello.client import server


Config()
_log = getLogger(__name__)

class OptionException(Exception):
    """
    Exception to be used, when value of an option is not valid e.g. not found
    """
    pass

class KatelloError(Exception):
    """
    User-friendly exception wrapper (used for stderr output).
    """

    def __init__(self, message, exception):
        self.message = message
        self.exception = exception

    def __str__(self):
        return repr(self.message) + ": " + repr(self.exception)


class KatelloCLI(Command):
    """
    Katello command line tool class.
    """

    def __init__(self):
        super(KatelloCLI, self).__init__()

        self.name = os.path.basename(sys.argv[0])
        self._server = None

        self._username = None
        self._password = None

        self._certfile = None
        self._keyfile  = None



    def setup_parser(self, parser):
        """
        Add options to the command line parser.
        @note: this method may be overridden to define new options
        """

        parser.add_option("-v", "--version", action="store_true", default=False,
                                    dest="version",  help=_('prints version information'))

        credentials = OptionGroup(parser, _('Katello User Account Credentials'))
        credentials.add_option('-u', '--username', dest='username',
                               default=None, help=_('account username'))
        credentials.add_option('-p', '--password', dest='password',
                               default=None, help=_('account password'))
        credentials.add_option('--cert-file', dest='certfile',
                               default=None, help=SUPPRESS_HELP)
        credentials.add_option('--key-file', dest='keyfile',
                               default=None, help=SUPPRESS_HELP)
        parser.add_option_group(credentials)

        server = OptionGroup(parser, _('Katello Server Information'))
        host = Config.parser.get('server', 'host') or 'localhost.localdomain'
        server.add_option('--host', dest='host', default=host,
                          help=_('katello server host name (default: %s)') % host)
        port = Config.parser.get('server', 'port') or '443'
        server.add_option('--port', dest='port', default=port,
                          help=SUPPRESS_HELP)
        scheme = Config.parser.get('server', 'scheme') or 'https'
        server.add_option('--scheme', dest='scheme', default=scheme,
                          help=SUPPRESS_HELP)
        path = Config.parser.get('server', 'path') or '/katello/api'
        server.add_option('--path', dest='path', default=path,
                          help=SUPPRESS_HELP)
        parser.add_option_group(server)

    def setup_server(self):
        """
        Setup the active server connection.
        """
        host = self.opts.host
        port = self.opts.port
        scheme = self.opts.scheme
        path = self.opts.path

        self._server = server.KatelloServer(host, int(port), scheme, path)
        server.set_active_server(self._server)

    def setup_credentials(self):
        """
        Setup up request credentials with the active server.
        """

        self._username = self._username or self.opts.username
        self._password = self._password or self.opts.password

        self._certfile = self._certfile or self.opts.certfile
        self._keyfile = self._keyfile or self.opts.keyfile

        if None not in (self._username, self._password):
            self._server.set_basic_auth_credentials(self._username,
                                                    self._password)
        elif None not in (self.opts.certfile, self.opts.keyfile):
            self._server.set_ssl_credentials(self.opts.certfile,
                                                self.opts.keyfile)
        else:
            self._server.set_kerberos_auth()

    def error(self, exception, errorMsg = None):
        msg = errorMsg if errorMsg else u_str(exception)
        print >> sys.stderr, "error: %s (more in the log file %s)" % (msg, logfile())
        _log.error(u_str(exception))
        _log.error(format_exc(exception))

    def run(self):
        self.setup_server()
        self.setup_credentials()

    def main(self, args, command_name=None, parent_usage=None):
        try:
            return super(KatelloCLI, self).main(args, command_name, parent_usage)

        except OptionParserExitError, opee:
            return opee.args[0]

        #except KatelloError, ex:
            #self.error(ex, ex.message)
            #return 1

        #except Exception, ex:
            ## for all the errors see ~/.katello/client.log or /var/log/katello/client.log
            #self.error(ex)
            #return 1


    #def main(self, args=sys.argv[1:]):
        #"""
        #Run this command.
        #@type args: list of str's
        #@param args: command line arguments
        #"""
        #if type(args) == str:
            #args = parse_tokens(args)

        #try:
            #self.setup_parser()
            #self.opts, args = self.parser.parse_args(args)

            #if self.opts.version:
                #self.setup_server()
                #self.setup_credentials()
                #api = VersionAPI()
                #print api.version_formatted()
                #return

            #if not args:
                #self.parser.error(_('No command given; please see --help'))

            #command = self.extract_command(args)

            ## process command and action options before setup_credentials
            ## to catch errors before accessing Kerberos
            #command_args = args[1:]
            #command.process_options(command.create_parser(), command_args)
            #self.setup_server()
            #action = command.extract_action(command_args)
            #if not action or action.require_credentials():
                #self.setup_credentials()

            #return command.main(command_args)

        #except OptionParserExitError, opee:
            #return opee.args[0]

        #except KatelloError, ex:
            #self.error(ex, ex.message)
            #return 1

        #except Exception, ex:
            ## for all the errors see ~/.katello/client.log or /var/log/katello/client.log
            #self.error(ex)
            #return 1
